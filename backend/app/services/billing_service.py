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
    def record_customer_payment(
        db: Session,
        tenant_id: uuid.UUID,
        data: PaymentCreate,
        collector_id: Optional[uuid.UUID] = None
    ) -> Payment:
        """Records an official customer payment, reconciles against invoices, and updates ledger."""
        customer = db.query(Customer).filter(
            Customer.id == data.customer_id,
            Customer.tenant_id == tenant_id
        ).first()
        if not customer:
            raise ValueError("Customer not found")

        now = datetime.now(timezone.utc)
        pay_number = f"RCPT-{secrets.token_hex(4).upper()}"

        payment = Payment(
            tenant_id=tenant_id,
            customer_id=customer.id,
            invoice_id=data.invoice_id,
            payment_number=pay_number,
            amount=data.amount,
            payment_method=data.payment_method,
            payment_ref_id=data.payment_ref_id,
            status="completed",
            payment_date=now,
            collected_by_id=collector_id,
            notes=data.notes
        )
        db.add(payment)

        # Update specific invoice if targeted
        if data.invoice_id:
            invoice = db.query(Invoice).filter(
                Invoice.id == data.invoice_id,
                Invoice.tenant_id == tenant_id
            ).first()
            if invoice:
                invoice.paid_amount += data.amount
                invoice.balance_due = max(0.0, invoice.total_amount - invoice.paid_amount)
                if invoice.balance_due <= 0:
                    invoice.status = "paid"
                else:
                    invoice.status = "partially_paid"

        # Update customer balance and immutable ledger
        customer.current_balance -= data.amount

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

        db.commit()
        db.refresh(payment)
        return payment

