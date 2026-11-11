import uuid
from datetime import datetime, date, timezone
from sqlalchemy import Column, String, Integer, Float, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import TenantAwareModel, GUID


class Invoice(TenantAwareModel):
    __tablename__ = "invoices"

    customer_id = Column(GUID(), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    branch_id = Column(GUID(), ForeignKey("branches.id", ondelete="CASCADE"), nullable=False, index=True)

    invoice_number = Column(String(50), nullable=False, index=True)
    billing_period_start = Column(Date, nullable=False)
    billing_period_end = Column(Date, nullable=False)
    due_date = Column(Date, nullable=False)

    subtotal = Column(Float, default=0.0, nullable=False)
    cgst_amount = Column(Float, default=0.0, nullable=False)
    sgst_amount = Column(Float, default=0.0, nullable=False)
    igst_amount = Column(Float, default=0.0, nullable=False)
    total_tax = Column(Float, default=0.0, nullable=False)
    total_amount = Column(Float, default=0.0, nullable=False)
    paid_amount = Column(Float, default=0.0, nullable=False)
    balance_due = Column(Float, default=0.0, nullable=False)

    status = Column(String(50), default="unpaid", nullable=False, index=True)
    # draft, unpaid, partially_paid, paid, overdue, cancelled
    pdf_url = Column(String(500), nullable=True)
    notes = Column(Text, nullable=True)

    customer = relationship("Customer", back_populates="invoices")
    branch = relationship("Branch")
    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="invoice")


class InvoiceItem(TenantAwareModel):
    __tablename__ = "invoice_items"

    invoice_id = Column(GUID(), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(GUID(), ForeignKey("products.id", ondelete="RESTRICT"), nullable=False)

    description = Column(String(255), nullable=False)
    quantity = Column(Integer, default=1, nullable=False)
    unit_price = Column(Float, nullable=False)
    gst_rate = Column(Float, default=0.0, nullable=False)
    tax_amount = Column(Float, default=0.0, nullable=False)
    total_amount = Column(Float, default=0.0, nullable=False)

    invoice = relationship("Invoice", back_populates="items")
    product = relationship("Product")


class Payment(TenantAwareModel):
    __tablename__ = "payments"

    customer_id = Column(GUID(), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    invoice_id = Column(GUID(), ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True, index=True)
    payment_number = Column(String(50), nullable=False, index=True)

    amount = Column(Float, nullable=False)
    payment_method = Column(String(50), default="cash", nullable=False)  # cash, upi, razorpay, bank_transfer, cheque
    payment_ref_id = Column(String(100), nullable=True)  # Razorpay payment ID / UTR number
    status = Column(String(50), default="completed", nullable=False)  # completed, pending, failed, refunded
    payment_date = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    collected_by_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    notes = Column(Text, nullable=True)

    customer = relationship("Customer")
    invoice = relationship("Invoice", back_populates="payments")
    collector = relationship("User")


class CustomerLedger(TenantAwareModel):
    """Immutable financial ledger for customer accounts."""
    __tablename__ = "customer_ledger"

    customer_id = Column(GUID(), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    transaction_date = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    transaction_type = Column(String(50), nullable=False, index=True)
    # opening_balance, invoice_charge, payment_received, jar_deposit_charge, jar_deposit_refund, adjustment, reversal

    debit_amount = Column(Float, default=0.0, nullable=False)   # Increases customer's debt
    credit_amount = Column(Float, default=0.0, nullable=False)  # Decreases customer's debt (e.g. payment)
    running_balance = Column(Float, nullable=False)             # Balance after this transaction

    reference_type = Column(String(50), nullable=True)          # invoice, payment, delivery, manual
    reference_id = Column(GUID(), nullable=True)
    notes = Column(Text, nullable=True)

    customer = relationship("Customer", back_populates="ledger_entries")


class Expense(TenantAwareModel):
    __tablename__ = "expenses"

    branch_id = Column(GUID(), ForeignKey("branches.id", ondelete="CASCADE"), nullable=False, index=True)
    category = Column(String(100), nullable=False, index=True)  # fuel, vehicle_repair, water_treatment, electricity, salary, miscellaneous
    amount = Column(Float, nullable=False)
    payment_mode = Column(String(50), default="cash", nullable=False)
    expense_date = Column(Date, default=date.today, nullable=False)
    description = Column(Text, nullable=False)
    receipt_url = Column(String(500), nullable=True)
    submitted_by_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(50), default="approved", nullable=False)  # pending, approved, rejected

    branch = relationship("Branch")
    submitted_by = relationship("User")

