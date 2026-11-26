import uuid
import secrets
import hashlib
from datetime import date, datetime, timezone
from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.delivery import Subscription, DeliveryTask, DeliveryRecord, DeliveryShipment
from app.models.customer import Customer
from app.models.tenant import Branch, User
from app.models.product import Product, Inventory, InventoryTransaction
from app.models.finance import Invoice, CustomerLedger
from app.schemas.delivery import (
    DeliveryRecordCreate,
    AssignShipmentRequest,
    OwnerOrderCreateRequest,
    CompleteShipmentRequest,
)
from app.schemas.finance import PaymentCreate
from app.services.billing_service import BillingService


class DeliveryService:
    @staticmethod
    def _new_order_number() -> str:
        return f"ORD-{secrets.token_hex(3).upper()}"

    @staticmethod
    def _new_shipment_number() -> str:
        return f"SHP-{secrets.token_hex(3).upper()}"

    @staticmethod
    def generate_daily_delivery_tasks(
        db: Session,
        tenant_id: uuid.UUID,
        target_date: date,
        branch_id: Optional[uuid.UUID] = None
    ) -> List[DeliveryTask]:
        """Generates delivery orders & default shipments from active subscriptions for target_date."""
        weekday = target_date.weekday()  # 0 = Monday, 6 = Sunday

        query = db.query(Subscription).filter(
            Subscription.tenant_id == tenant_id,
            Subscription.status == "active",
            Subscription.start_date <= target_date
        )
        if branch_id:
            query = query.filter(Subscription.branch_id == branch_id)

        subscriptions = query.all()
        created_tasks: List[DeliveryTask] = []

        for sub in subscriptions:
            if sub.pause_resume_date and sub.pause_resume_date > target_date:
                continue

            should_deliver = False
            if sub.schedule_type == "daily":
                should_deliver = True
            elif sub.schedule_type == "alternate_days":
                delta_days = (target_date - sub.start_date).days
                should_deliver = (delta_days % 2 == 0)
            elif sub.schedule_type == "weekdays":
                should_deliver = (weekday < 5)
            elif sub.schedule_type in ["weekly", "custom"]:
                should_deliver = weekday in (sub.schedule_days or [])

            if not should_deliver:
                continue

            raw_key = f"{tenant_id}:{sub.customer_id}:{sub.product_id}:{target_date.isoformat()}:{sub.shift}"
            idempotency_key = hashlib.sha256(raw_key.encode()).hexdigest()

            existing_task = db.query(DeliveryTask).filter(
                DeliveryTask.tenant_id == tenant_id,
                DeliveryTask.idempotency_key == idempotency_key
            ).first()

            if not existing_task:
                task = DeliveryTask(
                    tenant_id=tenant_id,
                    branch_id=sub.branch_id,
                    route_id=sub.route_id,
                    driver_id=sub.driver_id,
                    customer_id=sub.customer_id,
                    subscription_id=sub.id,
                    product_id=sub.product_id,
                    scheduled_date=target_date,
                    shift=sub.shift,
                    expected_qty=sub.quantity,
                    order_number=DeliveryService._new_order_number(),
                    source="subscription",
                    status="assigned" if sub.driver_id else "pending",
                    sequence_order=0,
                    idempotency_key=idempotency_key
                )
                db.add(task)
                db.flush()

                BillingService.generate_order_invoice(db, tenant_id, task, auto_commit=False)

                if sub.driver_id:
                    shp = DeliveryShipment(
                        tenant_id=tenant_id,
                        order_id=task.id,
                        driver_id=sub.driver_id,
                        customer_id=sub.customer_id,
                        product_id=sub.product_id,
                        branch_id=sub.branch_id,
                        shipment_number=DeliveryService._new_shipment_number(),
                        scheduled_date=target_date,
                        shift=sub.shift,
                        assigned_qty=sub.quantity,
                        amount_to_collect=0.0,
                        status="assigned",
                    )
                    db.add(shp)

                created_tasks.append(task)

        db.commit()
        return created_tasks

    @staticmethod
    def create_owner_order(
        db: Session,
        tenant_id: uuid.UUID,
        data: OwnerOrderCreateRequest,
        created_by_id: Optional[uuid.UUID] = None
    ) -> DeliveryTask:
        """Creates an order directly from the owner portal, generates its invoice, and optionally records upfront payment & initial shipments."""
        customer = db.query(Customer).filter(
            Customer.id == data.customer_id,
            Customer.tenant_id == tenant_id
        ).first()
        if not customer:
            raise ValueError("Customer not found")

        product = db.query(Product).filter(
            Product.id == data.product_id,
            Product.tenant_id == tenant_id
        ).first()
        if not product:
            raise ValueError("Product not found")

        if data.expected_qty <= 0:
            raise ValueError("Order quantity must be at least 1")

        branch_id = customer.branch_id
        if not branch_id:
            branch = db.query(Branch).filter(Branch.tenant_id == tenant_id).first()
            if not branch:
                raise ValueError("No branch configured for this business")
            branch_id = branch.id

        raw_key = f"{tenant_id}:{customer.id}:{product.id}:{data.scheduled_date.isoformat()}:{data.shift}:owner-{secrets.token_hex(6)}"
        idempotency_key = hashlib.sha256(raw_key.encode()).hexdigest()

        order = DeliveryTask(
            tenant_id=tenant_id,
            branch_id=branch_id,
            route_id=customer.route_id,
            driver_id=None,
            customer_id=customer.id,
            product_id=product.id,
            scheduled_date=data.scheduled_date,
            shift=data.shift,
            expected_qty=data.expected_qty,
            order_number=DeliveryService._new_order_number(),
            notes=data.notes,
            source="owner_created",
            status="pending",
            sequence_order=50,
            idempotency_key=idempotency_key
        )
        db.add(order)
        db.flush()

        invoice = BillingService.generate_order_invoice(db, tenant_id, order, auto_commit=False)

        if data.initial_payment_amount and data.initial_payment_amount > 0:
            BillingService.record_customer_payment(
                db,
                tenant_id,
                PaymentCreate(
                    customer_id=customer.id,
                    invoice_id=invoice.id,
                    order_id=order.id,
                    payment_stage="while_order",
                    amount=data.initial_payment_amount,
                    payment_method=data.initial_payment_method or "cash",
                    payment_ref_id=data.initial_payment_ref,
                    notes=f"Payment received while creating Order {order.order_number}"
                ),
                collector_id=created_by_id,
                auto_commit=False,
            )

        if data.shipments:
            for shp_req in data.shipments:
                DeliveryService.assign_shipment(db, tenant_id, order.id, shp_req, auto_commit=False)

        db.commit()
        db.refresh(order)
        return order

    @staticmethod
    def assign_shipment(
        db: Session,
        tenant_id: uuid.UUID,
        order_id: uuid.UUID,
        data: AssignShipmentRequest,
        auto_commit: bool = True
    ) -> DeliveryShipment:
        """Assigns a shipment slice (driver + qty + collection amount) to an order and generates its invoice if needed."""
        order = db.query(DeliveryTask).filter(
            DeliveryTask.id == order_id,
            DeliveryTask.tenant_id == tenant_id
        ).first()
        if not order:
            raise ValueError("Order not found")

        if order.status in ("rejected", "cancelled"):
            raise ValueError(f"Cannot assign shipments to a {order.status} order")

        driver = db.query(User).filter(
            User.id == data.driver_id,
            User.tenant_id == tenant_id,
            User.is_active == True
        ).first()
        if not driver:
            raise ValueError("Selected driver not found or inactive")

        if data.assigned_qty <= 0:
            raise ValueError("Shipment quantity must be at least 1")

        existing_shipments = db.query(DeliveryShipment).filter(
            DeliveryShipment.order_id == order.id,
            DeliveryShipment.tenant_id == tenant_id
        ).all()

        delivered_committed = sum(
            s.delivered_qty for s in existing_shipments if s.status in ("completed", "partially_completed")
        )
        active_committed = sum(
            s.assigned_qty for s in existing_shipments if s.status in ("assigned", "in_transit")
        )
        remaining_assignable = max(0, order.expected_qty - (delivered_committed + active_committed))

        if data.assigned_qty > remaining_assignable:
            raise ValueError(
                f"Cannot assign {data.assigned_qty} jars; only {remaining_assignable} unassigned jars remaining for this order"
            )

        invoice = BillingService.generate_order_invoice(db, tenant_id, order, auto_commit=False)

        # Default amount_to_collect if omitted: unpaid invoice balance minus already-planned active collections, capped by proportional value
        if data.amount_to_collect is not None:
            amount_to_collect = round(max(0.0, float(data.amount_to_collect)), 2)
        else:
            already_planned = sum(
                s.amount_to_collect for s in existing_shipments if s.status in ("assigned", "in_transit")
            )
            remaining_unpaid = max(0.0, float(invoice.balance_due) - already_planned)
            proportional = round((data.assigned_qty / max(1, order.expected_qty)) * float(invoice.total_amount), 2)
            amount_to_collect = round(min(remaining_unpaid, proportional), 2)

        shipment = DeliveryShipment(
            tenant_id=tenant_id,
            order_id=order.id,
            driver_id=driver.id,
            customer_id=order.customer_id,
            product_id=order.product_id,
            branch_id=order.branch_id,
            shipment_number=DeliveryService._new_shipment_number(),
            scheduled_date=data.scheduled_date or order.scheduled_date,
            shift=data.shift or order.shift,
            assigned_qty=data.assigned_qty,
            delivered_qty=0,
            empty_collected_qty=0,
            amount_to_collect=amount_to_collect,
            cash_collected=0.0,
            payment_mode="unpaid",
            status="assigned",
            notes=data.notes,
        )
        db.add(shipment)

        # Keep legacy driver_id pointer helpful on order if unset
        if order.driver_id is None:
            order.driver_id = driver.id
        if order.status in ("requested", "pending"):
            order.status = "assigned"

        if auto_commit:
            db.commit()
            db.refresh(shipment)
        else:
            db.flush()
        return shipment

    @staticmethod
    def reject_order(
        db: Session,
        tenant_id: uuid.UUID,
        order_id: uuid.UUID,
        reason: Optional[str] = None
    ) -> DeliveryTask:
        """Rejects a customer request or pending order prior to delivery."""
        order = db.query(DeliveryTask).filter(
            DeliveryTask.id == order_id,
            DeliveryTask.tenant_id == tenant_id
        ).first()
        if not order:
            raise ValueError("Order not found")

        shipments = db.query(DeliveryShipment).filter(
            DeliveryShipment.order_id == order.id,
            DeliveryShipment.tenant_id == tenant_id
        ).all()
        if any(s.delivered_qty > 0 for s in shipments):
            raise ValueError("Cannot reject an order that already has delivered jars")

        order.status = "rejected"
        order.rejection_reason = reason or "Rejected by business owner"

        for s in shipments:
            if s.status in ("assigned", "in_transit"):
                s.status = "cancelled"

        invoice = db.query(Invoice).filter(
            Invoice.order_id == order.id,
            Invoice.tenant_id == tenant_id
        ).first()
        if invoice and invoice.status != "cancelled":
            unpaid_reversal = invoice.balance_due
            invoice.status = "cancelled"
            invoice.balance_due = 0.0
            if unpaid_reversal > 0:
                customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
                if customer:
                    customer.current_balance = round(customer.current_balance - unpaid_reversal, 2)
                    db.add(
                        CustomerLedger(
                            tenant_id=tenant_id,
                            customer_id=customer.id,
                            transaction_date=datetime.now(timezone.utc),
                            transaction_type="reversal",
                            debit_amount=0.0,
                            credit_amount=unpaid_reversal,
                            running_balance=customer.current_balance,
                            reference_type="order_rejected",
                            reference_id=order.id,
                            notes=f"Reversed invoice {invoice.invoice_number} due to order rejection"
                        )
                    )

        db.commit()
        db.refresh(order)
        return order

    @staticmethod
    def _recompute_order_status(db: Session, order: DeliveryTask):
        shipments = db.query(DeliveryShipment).filter(
            DeliveryShipment.order_id == order.id,
            DeliveryShipment.tenant_id == order.tenant_id
        ).all()
        total_delivered = sum(
            s.delivered_qty for s in shipments if s.status in ("completed", "partially_completed")
        )
        has_active = any(s.status in ("assigned", "in_transit") for s in shipments)

        if total_delivered >= order.expected_qty:
            order.status = "completed"
        elif total_delivered > 0:
            order.status = "partially_completed"
        elif has_active:
            order.status = "assigned"
        elif any(s.status == "failed" for s in shipments):
            order.status = "failed"

    @staticmethod
    def complete_shipment(
        db: Session,
        tenant_id: uuid.UUID,
        shipment_id: uuid.UUID,
        data: CompleteShipmentRequest,
        driver_id: Optional[uuid.UUID] = None
    ) -> DeliveryShipment:
        """Records delivery completion for a single shipment, updates jar inventory, records payment at delivery, and rolls up parent order status."""
        if data.client_tx_id:
            existing = db.query(DeliveryShipment).filter(
                DeliveryShipment.tenant_id == tenant_id,
                DeliveryShipment.client_tx_id == data.client_tx_id
            ).first()
            if existing:
                return existing

        shipment = db.query(DeliveryShipment).filter(
            DeliveryShipment.id == shipment_id,
            DeliveryShipment.tenant_id == tenant_id
        ).first()
        if not shipment:
            raise ValueError("Shipment not found")

        order = db.query(DeliveryTask).filter(
            DeliveryTask.id == shipment.order_id,
            DeliveryTask.tenant_id == tenant_id
        ).first()
        if not order:
            raise ValueError("Parent order not found")

        customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
        product = db.query(Product).filter(Product.id == order.product_id).first()
        now = datetime.now(timezone.utc)

        shipment.delivered_qty = data.delivered_qty if data.delivery_status == "delivered" else 0
        shipment.empty_collected_qty = data.empty_collected_qty if data.delivery_status == "delivered" else 0
        shipment.cash_collected = data.cash_collected
        shipment.payment_mode = data.payment_mode
        shipment.notes = data.notes
        shipment.failure_reason = data.failure_reason
        shipment.delivered_at = now
        shipment.client_tx_id = data.client_tx_id

        if data.delivery_status == "delivered":
            if data.delivered_qty >= shipment.assigned_qty:
                shipment.status = "completed"
            else:
                shipment.status = "partially_completed"
        else:
            shipment.status = "failed"

        # Ensure invoice exists (idempotent; handles single ledger debit for the order)
        invoice = BillingService.generate_order_invoice(db, tenant_id, order, auto_commit=False)

        # Upsert legacy DeliveryRecord for backward compatibility with reporting queries
        existing_rec = db.query(DeliveryRecord).filter(DeliveryRecord.delivery_task_id == order.id).first()
        if not existing_rec:
            rec = DeliveryRecord(
                tenant_id=tenant_id,
                delivery_task_id=order.id,
                driver_id=driver_id or shipment.driver_id,
                customer_id=order.customer_id,
                delivered_qty=shipment.delivered_qty,
                empty_collected_qty=shipment.empty_collected_qty,
                cash_collected=shipment.cash_collected,
                payment_mode=shipment.payment_mode,
                delivery_status=data.delivery_status,
                failure_reason=data.failure_reason,
                notes=data.notes,
                delivered_at=now,
                client_tx_id=data.client_tx_id
            )
            db.add(rec)
        else:
            existing_rec.delivered_qty += shipment.delivered_qty
            existing_rec.empty_collected_qty += shipment.empty_collected_qty
            existing_rec.cash_collected += shipment.cash_collected
            existing_rec.delivered_at = now

        if data.delivery_status == "delivered" and product and customer:
            net_jars = shipment.delivered_qty - shipment.empty_collected_qty
            customer.jar_balance += net_jars

            inventory = db.query(Inventory).filter(
                Inventory.tenant_id == tenant_id,
                Inventory.branch_id == order.branch_id,
                Inventory.product_id == product.id
            ).first()

            if inventory and product.is_returnable:
                inventory.with_customers += net_jars
                inventory.filled_transit = max(0, inventory.filled_transit - shipment.delivered_qty)
                inventory.empty_transit += shipment.empty_collected_qty

                inv_tx = InventoryTransaction(
                    tenant_id=tenant_id,
                    branch_id=order.branch_id,
                    product_id=product.id,
                    transaction_type="customer_delivery",
                    quantity=shipment.delivered_qty,
                    source_state="filled_transit",
                    destination_state="with_customers",
                    reference_type="delivery_shipment",
                    reference_id=shipment.id,
                    performed_by_id=driver_id or shipment.driver_id,
                    notes=f"Shipment {shipment.shipment_number}: Delivered {shipment.delivered_qty} jars, collected {shipment.empty_collected_qty} empty"
                )
                db.add(inv_tx)

            if data.cash_collected > 0:
                BillingService.record_customer_payment(
                    db,
                    tenant_id,
                    PaymentCreate(
                        customer_id=customer.id,
                        invoice_id=invoice.id,
                        order_id=order.id,
                        shipment_id=shipment.id,
                        payment_stage="while_delivery",
                        amount=data.cash_collected,
                        payment_method=data.payment_mode if data.payment_mode != "unpaid" else "cash",
                        notes=data.notes or f"Collected on delivery ({shipment.shipment_number})"
                    ),
                    collector_id=driver_id or shipment.driver_id,
                    auto_commit=False,
                )

        db.flush()
        DeliveryService._recompute_order_status(db, order)

        db.commit()
        db.refresh(shipment)
        return shipment

    @staticmethod
    def record_delivery_execution(
        db: Session,
        tenant_id: uuid.UUID,
        data: DeliveryRecordCreate,
        driver_id: Optional[uuid.UUID] = None
    ) -> DeliveryRecord:
        """Backward-compatible entry point delegating task delivery completion to shipment workflow."""
        if data.client_tx_id:
            existing = db.query(DeliveryRecord).filter(
                DeliveryRecord.tenant_id == tenant_id,
                DeliveryRecord.client_tx_id == data.client_tx_id
            ).first()
            if existing:
                return existing

        order = db.query(DeliveryTask).filter(
            DeliveryTask.id == data.delivery_task_id,
            DeliveryTask.tenant_id == tenant_id
        ).first()
        if not order:
            raise ValueError("Delivery task not found")

        active_shp = db.query(DeliveryShipment).filter(
            DeliveryShipment.order_id == order.id,
            DeliveryShipment.tenant_id == tenant_id,
            DeliveryShipment.status.in_(["assigned", "in_transit"])
        ).first()

        if not active_shp:
            active_shp = DeliveryShipment(
                tenant_id=tenant_id,
                order_id=order.id,
                driver_id=driver_id or order.driver_id,
                customer_id=order.customer_id,
                product_id=order.product_id,
                branch_id=order.branch_id,
                shipment_number=DeliveryService._new_shipment_number(),
                scheduled_date=order.scheduled_date,
                shift=order.shift,
                assigned_qty=order.expected_qty,
                amount_to_collect=0.0,
                status="assigned",
            )
            db.add(active_shp)
            db.flush()

        DeliveryService.complete_shipment(
            db,
            tenant_id,
            active_shp.id,
            CompleteShipmentRequest(
                delivered_qty=data.delivered_qty,
                empty_collected_qty=data.empty_collected_qty,
                cash_collected=data.cash_collected,
                payment_mode=data.payment_mode,
                delivery_status=data.delivery_status,
                failure_reason=data.failure_reason,
                notes=data.notes,
                client_tx_id=data.client_tx_id,
            ),
            driver_id=driver_id or active_shp.driver_id
        )

        rec = db.query(DeliveryRecord).filter(DeliveryRecord.delivery_task_id == order.id).first()
        return rec
