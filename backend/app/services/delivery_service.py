import uuid
import secrets
from datetime import date, datetime, timezone
from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.delivery import Subscription, DeliveryTask, DeliveryRecord
from app.models.customer import Customer, CustomerProductPrice
from app.models.product import Product, Inventory, InventoryTransaction
from app.models.finance import Payment, CustomerLedger
from app.schemas.delivery import DeliveryRecordCreate


class DeliveryService:
    @staticmethod
    def generate_daily_delivery_tasks(
        db: Session,
        tenant_id: uuid.UUID,
        target_date: date,
        branch_id: Optional[uuid.UUID] = None
    ) -> List[DeliveryTask]:
        """Generates delivery tasks from active subscriptions for target_date.
        Idempotent: background job re-runs never create duplicate delivery stops.
        """
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
            # Check pause status
            if sub.pause_resume_date and sub.pause_resume_date > target_date:
                continue

            # Check schedule match
            should_deliver = False
            if sub.schedule_type == "daily":
                should_deliver = True
            elif sub.schedule_type == "alternate_days":
                # Check day parity relative to start_date
                delta_days = (target_date - sub.start_date).days
                should_deliver = (delta_days % 2 == 0)
            elif sub.schedule_type == "weekdays":
                should_deliver = (weekday < 5)  # Mon-Fri
            elif sub.schedule_type in ["weekly", "custom"]:
                should_deliver = weekday in (sub.schedule_days or [])

            if not should_deliver:
                continue

            # Idempotency key per customer + product + date + shift
            idempotency_key = f"{tenant_id}:{sub.customer_id}:{sub.product_id}:{target_date.isoformat()}:{sub.shift}"

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
                    status="pending",
                    sequence_order=0,
                    idempotency_key=idempotency_key
                )
                db.add(task)
                created_tasks.append(task)

        db.commit()
        return created_tasks

    @staticmethod
    def record_delivery_execution(
        db: Session,
        tenant_id: uuid.UUID,
        data: DeliveryRecordCreate,
        driver_id: Optional[uuid.UUID] = None
    ) -> DeliveryRecord:
        """Processes a completed or failed delivery stop.
        Atomically updates customer jar balance, inventory states, and customer ledger.
        """
        # 1. Check offline client_tx_id for duplicate sync
        if data.client_tx_id:
            existing = db.query(DeliveryRecord).filter(
                DeliveryRecord.tenant_id == tenant_id,
                DeliveryRecord.client_tx_id == data.client_tx_id
            ).first()
            if existing:
                return existing

        # 2. Fetch task
        task = db.query(DeliveryTask).filter(
            DeliveryTask.id == data.delivery_task_id,
            DeliveryTask.tenant_id == tenant_id
        ).first()
        if not task:
            raise ValueError("Delivery task not found")

        customer = db.query(Customer).filter(Customer.id == task.customer_id).first()
        product = db.query(Product).filter(Product.id == task.product_id).first()
        now = datetime.now(timezone.utc)

        # 3. Create DeliveryRecord
        record = DeliveryRecord(
            tenant_id=tenant_id,
            delivery_task_id=task.id,
            driver_id=driver_id or task.driver_id,
            customer_id=task.customer_id,
            delivered_qty=data.delivered_qty,
            empty_collected_qty=data.empty_collected_qty,
            cash_collected=data.cash_collected,
            payment_mode=data.payment_mode,
            delivery_status=data.delivery_status,
            failure_reason=data.failure_reason,
            notes=data.notes,
            proof_photo_url=data.proof_photo_url,
            latitude=data.latitude,
            longitude=data.longitude,
            delivered_at=now,
            client_tx_id=data.client_tx_id
        )
        db.add(record)

        # 4. Update Task Status
        if data.delivery_status == "delivered":
            if data.delivered_qty >= task.expected_qty:
                task.status = "completed"
            else:
                task.status = "partially_completed"
        else:
            task.status = "failed"

        # 5. Inventory & Jar Balance Tracking
        if data.delivery_status == "delivered" and product:
            # Update customer jar holdings
            net_jars = data.delivered_qty - data.empty_collected_qty
            customer.jar_balance += net_jars

            # Update inventory in transit
            inventory = db.query(Inventory).filter(
                Inventory.tenant_id == tenant_id,
                Inventory.branch_id == task.branch_id,
                Inventory.product_id == product.id
            ).first()

            if inventory and product.is_returnable:
                # Driver transit to customer
                inventory.with_customers += net_jars
                inventory.filled_transit = max(0, inventory.filled_transit - data.delivered_qty)
                inventory.empty_transit += data.empty_collected_qty

                # Auditable inventory transaction
                inv_tx = InventoryTransaction(
                    tenant_id=tenant_id,
                    branch_id=task.branch_id,
                    product_id=product.id,
                    transaction_type="customer_delivery",
                    quantity=data.delivered_qty,
                    source_state="filled_transit",
                    destination_state="with_customers",
                    reference_type="delivery_record",
                    reference_id=record.id,
                    performed_by_id=driver_id,
                    notes=f"Delivered {data.delivered_qty} jars, collected {data.empty_collected_qty} empty"
                )
                db.add(inv_tx)

            # 6. Financial Ledger Updates
            # Resolve customer price
            custom_pricing = db.query(CustomerProductPrice).filter(
                CustomerProductPrice.tenant_id == tenant_id,
                CustomerProductPrice.customer_id == customer.id,
                CustomerProductPrice.product_id == product.id
            ).first()
            unit_price = custom_pricing.custom_price if custom_pricing else product.selling_price
            delivery_charge = data.delivered_qty * unit_price

            if delivery_charge > 0:
                customer.current_balance += delivery_charge
                ledger_debit = CustomerLedger(
                    tenant_id=tenant_id,
                    customer_id=customer.id,
                    transaction_date=now,
                    transaction_type="delivery_charge",
                    debit_amount=delivery_charge,
                    credit_amount=0.0,
                    running_balance=customer.current_balance,
                    reference_type="delivery_record",
                    reference_id=record.id,
                    notes=f"Delivered {data.delivered_qty} x {product.name} @ ₹{unit_price}"
                )
                db.add(ledger_debit)

            # If cash/COD payment collected at doorstep
            if data.cash_collected > 0:
                customer.current_balance -= data.cash_collected

                payment_num = f"PAY-{secrets.token_hex(4).upper()}"
                payment = Payment(
                    tenant_id=tenant_id,
                    customer_id=customer.id,
                    payment_number=payment_num,
                    amount=data.cash_collected,
                    payment_method=data.payment_mode if data.payment_mode != "unpaid" else "cash",
                    payment_date=now,
                    collected_by_id=driver_id,
                    status="completed",
                    notes="Doorstep COD collection by delivery executive"
                )
                db.add(payment)

                ledger_credit = CustomerLedger(
                    tenant_id=tenant_id,
                    customer_id=customer.id,
                    transaction_date=now,
                    transaction_type="payment_received",
                    debit_amount=0.0,
                    credit_amount=data.cash_collected,
                    running_balance=customer.current_balance,
                    reference_type="doorstep_payment",
                    reference_id=payment.id,
                    notes=f"Doorstep collection: {payment_num}"
                )
                db.add(ledger_credit)

        db.commit()
        db.refresh(record)
        return record
