import uuid
import secrets
from datetime import date, datetime, timezone, timedelta
from typing import List, Optional
import calendar
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.finance import Invoice, InvoiceItem, Payment, CustomerLedger
from app.models.customer import Customer, CustomerProductPrice
from app.models.product import Product
from app.models.delivery import DeliveryRecord, DeliveryTask
from app.schemas.finance import PaymentCreate


class BillingService:
    @staticmethod
    def generate_monthly_invoices(
        db: Session,
        tenant_id: uuid.UUID,
        month: int,
        year: int,
        due_days: int = 7,
        branch_id: Optional[uuid.UUID] = None
    ) -> List[Invoice]:
        """Generates comprehensive GST-compliant invoices for all customers based on monthly deliveries."""
        _, last_day = calendar.monthrange(year, month)
        period_start = date(year, month, 1)
        period_end = date(year, month, last_day)
        due_date = period_end + timedelta(days=due_days)

        customers_query = db.query(Customer).filter(
            Customer.tenant_id == tenant_id,
            Customer.is_active == True
        )
        if branch_id:
            customers_query = customers_query.filter(Customer.branch_id == branch_id)
        customers = customers_query.all()

        generated_invoices: List[Invoice] = []

        for customer in customers:
            # Query delivered records for this customer in the month
            records = db.query(DeliveryRecord, DeliveryTask, Product).join(
                DeliveryTask, DeliveryRecord.delivery_task_id == DeliveryTask.id
            ).join(
                Product, DeliveryTask.product_id == Product.id
            ).filter(
                DeliveryRecord.tenant_id == tenant_id,
                DeliveryRecord.customer_id == customer.id,
                DeliveryRecord.delivery_status == "delivered",
                DeliveryTask.scheduled_date >= period_start,
                DeliveryTask.scheduled_date <= period_end
            ).all()

            if not records:
                continue

            # Group delivery consumption by product
            product_quantities: dict[uuid.UUID, int] = {}
            product_objs: dict[uuid.UUID, Product] = {}
            for rec, task, prod in records:
                product_quantities[prod.id] = product_quantities.get(prod.id, 0) + rec.delivered_qty
                product_objs[prod.id] = prod

            # Calculate subtotal and GST
            subtotal = 0.0
            total_tax = 0.0
            invoice_items_data = []

            for prod_id, qty in product_quantities.items():
                prod = product_objs[prod_id]
                # Check custom customer price
                custom = db.query(CustomerProductPrice).filter(
                    CustomerProductPrice.tenant_id == tenant_id,
                    CustomerProductPrice.customer_id == customer.id,
                    CustomerProductPrice.product_id == prod.id
                ).first()
                rate = custom.custom_price if custom else prod.selling_price
                line_total = qty * rate

                # GST breakdown (assuming intra-state standard CGST 9% + SGST 9% or based on prod.gst_rate)
                tax_rate = prod.gst_rate
                tax_amt = (line_total * tax_rate) / 100.0
                subtotal += line_total
                total_tax += tax_amt

                invoice_items_data.append({
                    "product_id": prod.id,
                    "description": f"{prod.name} ({qty} {prod.unit})",
                    "quantity": qty,
                    "unit_price": rate,
                    "gst_rate": tax_rate,
                    "tax_amount": tax_amt,
                    "total_amount": line_total + tax_amt
                })

            total_amount = subtotal + total_tax
            inv_number = f"INV-{year}{month:02d}-{(len(generated_invoices) + 1):04d}"

            invoice = Invoice(
                tenant_id=tenant_id,
                customer_id=customer.id,
                branch_id=customer.branch_id,
                invoice_number=inv_number,
                billing_period_start=period_start,
                billing_period_end=period_end,
                due_date=due_date,
                subtotal=subtotal,
                cgst_amount=total_tax / 2.0,
                sgst_amount=total_tax / 2.0,
                igst_amount=0.0,
                total_tax=total_tax,
                total_amount=total_amount,
                paid_amount=0.0,
                balance_due=total_amount,
                status="unpaid"
            )
            db.add(invoice)
            db.flush()

            for item_info in invoice_items_data:
                item = InvoiceItem(
                    tenant_id=tenant_id,
                    invoice_id=invoice.id,
                    **item_info
                )
                db.add(item)

            generated_invoices.append(invoice)

        db.commit()
        return generated_invoices

    @staticmethod
    def resolve_order_pricing(
        db: Session,
        tenant_id: uuid.UUID,
        customer_id: uuid.UUID,
        product_id: uuid.UUID,
        quantity: int
    ) -> dict:
        """Resolves customer-specific or catalog pricing + GST for a single order."""
        product = db.query(Product).filter(
            Product.id == product_id,
            Product.tenant_id == tenant_id
        ).first()
        if not product:
            raise ValueError("Product not found")

        custom = db.query(CustomerProductPrice).filter(
            CustomerProductPrice.tenant_id == tenant_id,
            CustomerProductPrice.customer_id == customer_id,
            CustomerProductPrice.product_id == product_id
        ).first()
        unit_price = custom.custom_price if custom else product.selling_price
        subtotal = round(quantity * unit_price, 2)
        gst_rate = float(product.gst_rate or 0.0)
        tax_amount = round((subtotal * gst_rate) / 100.0, 2)
        total_amount = round(subtotal + tax_amount, 2)
        return {
            "product": product,
            "unit_price": unit_price,
            "subtotal": subtotal,
            "gst_rate": gst_rate,
            "tax_amount": tax_amount,
            "total_amount": total_amount,
        }

    @staticmethod
    def generate_order_invoice(
        db: Session,
        tenant_id: uuid.UUID,
        order: DeliveryTask,
        auto_commit: bool = False
    ) -> Invoice:
        """Generates (idempotently) a per-order invoice and debits the customer ledger once."""
        existing = db.query(Invoice).filter(
            Invoice.tenant_id == tenant_id,
            Invoice.order_id == order.id
        ).first()
        if existing:
            return existing

        customer = db.query(Customer).filter(
            Customer.id == order.customer_id,
            Customer.tenant_id == tenant_id
        ).first()
        if not customer:
            raise ValueError("Customer not found")

        pricing = BillingService.resolve_order_pricing(
            db, tenant_id, order.customer_id, order.product_id, order.expected_qty
        )
        prod = pricing["product"]

        order.unit_price = pricing["unit_price"]
        order.total_amount = pricing["total_amount"]

        inv_suffix = order.order_number or secrets.token_hex(3).upper()
        inv_number = f"INV-{inv_suffix}"
        if db.query(Invoice).filter(Invoice.tenant_id == tenant_id, Invoice.invoice_number == inv_number).first():
            inv_number = f"INV-{inv_suffix}-{secrets.token_hex(2).upper()}"

        branch_id = order.branch_id or customer.branch_id
        total_amount = pricing["total_amount"]
        tax_amount = pricing["tax_amount"]

        invoice = Invoice(
            tenant_id=tenant_id,
            customer_id=customer.id,
            branch_id=branch_id,
            order_id=order.id,
            invoice_number=inv_number,
            billing_period_start=order.scheduled_date,
            billing_period_end=order.scheduled_date,
            due_date=order.scheduled_date + timedelta(days=7),
            subtotal=pricing["subtotal"],
            cgst_amount=round(tax_amount / 2.0, 2),
            sgst_amount=round(tax_amount / 2.0, 2),
            igst_amount=0.0,
            total_tax=tax_amount,
            total_amount=total_amount,
            paid_amount=0.0,
            balance_due=total_amount,
            status="unpaid" if total_amount > 0 else "paid",
            notes=f"Auto-generated invoice for Order {order.order_number or order.id}"
        )
        db.add(invoice)
        db.flush()

        item = InvoiceItem(
            tenant_id=tenant_id,
            invoice_id=invoice.id,
            product_id=prod.id,
            description=f"{prod.name} ({order.expected_qty} {prod.unit})",
            quantity=order.expected_qty,
            unit_price=pricing["unit_price"],
            gst_rate=pricing["gst_rate"],
            tax_amount=tax_amount,
            total_amount=total_amount
        )
        db.add(item)

        if total_amount > 0:
            now = datetime.now(timezone.utc)
            customer.current_balance += total_amount
            ledger_debit = CustomerLedger(
                tenant_id=tenant_id,
                customer_id=customer.id,
                transaction_date=now,
                transaction_type="invoice_charge",
                debit_amount=total_amount,
                credit_amount=0.0,
                running_balance=customer.current_balance,
                reference_type="order_invoice",
                reference_id=invoice.id,
                notes=f"Order {order.order_number or ''} Invoice {inv_number}: {order.expected_qty} x {prod.name}"
            )
            db.add(ledger_debit)

        if auto_commit:
            db.commit()
            db.refresh(invoice)
        return invoice

    @staticmethod
    def record_customer_payment(
        db: Session,
        tenant_id: uuid.UUID,
        data: PaymentCreate,
        collector_id: Optional[uuid.UUID] = None,
        auto_commit: bool = True
    ) -> Payment:
        """Records an official customer payment, reconciles against order/invoice, and updates ledger."""
        customer = db.query(Customer).filter(
            Customer.id == data.customer_id,
            Customer.tenant_id == tenant_id
        ).first()
        if not customer:
            raise ValueError("Customer not found")

        now = datetime.now(timezone.utc)
        pay_number = f"RCPT-{secrets.token_hex(4).upper()}"

        target_invoice_id = data.invoice_id
        target_invoice: Optional[Invoice] = None

        if target_invoice_id:
            target_invoice = db.query(Invoice).filter(
                Invoice.id == target_invoice_id,
                Invoice.tenant_id == tenant_id
            ).first()
        elif data.order_id:
            target_invoice = db.query(Invoice).filter(
                Invoice.order_id == data.order_id,
                Invoice.tenant_id == tenant_id
            ).first()
            if not target_invoice:
                order = db.query(DeliveryTask).filter(
                    DeliveryTask.id == data.order_id,
                    DeliveryTask.tenant_id == tenant_id
                ).first()
                if order:
                    target_invoice = BillingService.generate_order_invoice(db, tenant_id, order, auto_commit=False)
            if target_invoice:
                target_invoice_id = target_invoice.id

        payment = Payment(
            tenant_id=tenant_id,
            customer_id=customer.id,
            invoice_id=target_invoice_id,
            order_id=data.order_id or (target_invoice.order_id if target_invoice else None),
            shipment_id=data.shipment_id,
            payment_number=pay_number,
            amount=data.amount,
            payment_method=data.payment_method,
            payment_ref_id=data.payment_ref_id,
            payment_stage=data.payment_stage or "later",
            status="completed",
            payment_date=now,
            collected_by_id=collector_id,
            notes=data.notes
        )
        db.add(payment)
        db.flush()

        if target_invoice:
            target_invoice.paid_amount = round(target_invoice.paid_amount + data.amount, 2)
            target_invoice.balance_due = round(max(0.0, target_invoice.total_amount - target_invoice.paid_amount), 2)
            if target_invoice.balance_due <= 0.01:
                target_invoice.balance_due = 0.0
                target_invoice.status = "paid"
            else:
                target_invoice.status = "partially_paid"

        # Update customer balance and immutable ledger
        customer.current_balance = round(customer.current_balance - data.amount, 2)

        ledger_entry = CustomerLedger(
            tenant_id=tenant_id,
            customer_id=customer.id,
            transaction_date=now,
            transaction_type="payment_received",
            debit_amount=0.0,
            credit_amount=data.amount,
            running_balance=customer.current_balance,
            reference_type="payment_receipt",
            reference_id=payment.id,
            notes=f"Payment received: {pay_number} ({data.payment_method.upper()})"
        )
        db.add(ledger_entry)

        if auto_commit:
            db.commit()
            db.refresh(payment)
        return payment

