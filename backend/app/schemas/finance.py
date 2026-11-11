import uuid
from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel


class InvoiceItemSchema(BaseModel):
    product_id: uuid.UUID
    description: str
    quantity: int
    unit_price: float
    gst_rate: float
    tax_amount: float
    total_amount: float

    class Config:
        from_attributes = True


class InvoiceResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    customer_id: uuid.UUID
    customer_name: Optional[str] = None
    branch_id: uuid.UUID
    invoice_number: str
    billing_period_start: date
    billing_period_end: date
    due_date: date
    subtotal: float
    cgst_amount: float
    sgst_amount: float
    igst_amount: float
    total_tax: float
    total_amount: float
    paid_amount: float
    balance_due: float
    status: str
    pdf_url: Optional[str] = None
    created_at: datetime
    items: List[InvoiceItemSchema] = []

    class Config:
        from_attributes = True


class InvoiceGenerateMonthlyRequest(BaseModel):
    branch_id: Optional[uuid.UUID] = None
    billing_month: int
    billing_year: int
    due_days: int = 7


class PaymentCreate(BaseModel):
    customer_id: uuid.UUID
    invoice_id: Optional[uuid.UUID] = None
    amount: float
    payment_method: str = "cash"  # cash, upi, razorpay, bank_transfer, cheque
    payment_ref_id: Optional[str] = None
    notes: Optional[str] = None


class PaymentResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    customer_id: uuid.UUID
    invoice_id: Optional[uuid.UUID]
    payment_number: str
    amount: float
    payment_method: str
    payment_ref_id: Optional[str]
    status: str
    payment_date: datetime

    class Config:
        from_attributes = True


class CustomerLedgerResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    customer_id: uuid.UUID
    transaction_date: datetime
    transaction_type: str
    debit_amount: float
    credit_amount: float
    running_balance: float
    reference_type: Optional[str]
    reference_id: Optional[uuid.UUID]
    notes: Optional[str]

    class Config:
        from_attributes = True


class ExpenseCreate(BaseModel):
    branch_id: uuid.UUID
    category: str
    amount: float
    payment_mode: str = "cash"
    expense_date: date = date.today()
    description: str


class ExpenseResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    branch_id: uuid.UUID
    category: str
    amount: float
    payment_mode: str
    expense_date: date
    description: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

