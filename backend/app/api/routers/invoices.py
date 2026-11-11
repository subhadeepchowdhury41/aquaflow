import uuid
from typing import List, Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.dependencies import get_current_tenant_user, get_current_verified_tenant, require_permission
from app.core.permissions import Permission
from app.models.tenant import User, Tenant
from app.models.finance import Invoice, InvoiceItem, Payment, Expense
from app.models.customer import Customer
from app.schemas.finance import (
    InvoiceResponse,
    InvoiceItemSchema,
    InvoiceGenerateMonthlyRequest,
    PaymentCreate,
    PaymentResponse,
    ExpenseCreate,
    ExpenseResponse
)
from app.services.billing_service import BillingService

router = APIRouter(prefix="/invoices", tags=["Billing & Payments"])


@router.get("", response_model=List[InvoiceResponse])
def list_invoices(
    customer_id: Optional[uuid.UUID] = Query(None),
    status_filter: Optional[str] = Query(None),
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Lists customer invoices with GST tax breakdowns and outstanding balances."""
    query = db.query(Invoice, Customer).join(
        Customer, Invoice.customer_id == Customer.id
    ).filter(Invoice.tenant_id == user.tenant_id)

    if customer_id:
        query = query.filter(Invoice.customer_id == customer_id)
    if status_filter:
        query = query.filter(Invoice.status == status_filter)

    results = []
    for inv, cust in query.order_by(Invoice.created_at.desc()).all():
        items_schema = [
            InvoiceItemSchema(
                product_id=it.product_id,
                description=it.description,
                quantity=it.quantity,
                unit_price=it.unit_price,
                gst_rate=it.gst_rate,
                tax_amount=it.tax_amount,
                total_amount=it.total_amount
            )
            for it in inv.items
        ]
        results.append(
            InvoiceResponse(
                id=inv.id,
                tenant_id=inv.tenant_id,
                customer_id=inv.customer_id,
                customer_name=cust.name,
                branch_id=inv.branch_id,
                invoice_number=inv.invoice_number,
                billing_period_start=inv.billing_period_start,
                billing_period_end=inv.billing_period_end,
                due_date=inv.due_date,
                subtotal=inv.subtotal,
                cgst_amount=inv.cgst_amount,
                sgst_amount=inv.sgst_amount,
                igst_amount=inv.igst_amount,
                total_tax=inv.total_tax,
                total_amount=inv.total_amount,
                paid_amount=inv.paid_amount,
                balance_due=inv.balance_due,
                status=inv.status,
                pdf_url=inv.pdf_url,
                created_at=inv.created_at,
                items=items_schema
            )
        )
    return results


@router.post("/generate-monthly")
def generate_monthly_cycle_invoices(
    data: InvoiceGenerateMonthlyRequest,
    tenant: Tenant = Depends(get_current_verified_tenant),
    user: User = Depends(require_permission(Permission.INVOICE_WRITE)),
    db: Session = Depends(get_db)
):
    """Generates bulk GST-ready invoices for all customers for the specified month/year."""
    invoices = BillingService.generate_monthly_invoices(
        db,
        tenant.id,
        month=data.billing_month,
        year=data.billing_year,
        due_days=data.due_days,
        branch_id=data.branch_id
    )
    return {
        "success": True,
        "invoices_generated": len(invoices),
        "message": f"Generated {len(invoices)} invoices for {data.billing_month}/{data.billing_year}"
    }


@router.post("/payments", response_model=PaymentResponse)
def record_payment(
    data: PaymentCreate,
    tenant: Tenant = Depends(get_current_verified_tenant),
    user: User = Depends(require_permission(Permission.PAYMENT_RECORD)),
    db: Session = Depends(get_db)
):
    """Records an official customer payment, reconciles against invoices, and posts to ledger."""
    try:
        payment = BillingService.record_customer_payment(db, tenant.id, data, collector_id=user.id)
        return PaymentResponse(
            id=payment.id,
            tenant_id=payment.tenant_id,
            customer_id=payment.customer_id,
            invoice_id=payment.invoice_id,
            payment_number=payment.payment_number,
            amount=payment.amount,
            payment_method=payment.payment_method,
            payment_ref_id=payment.payment_ref_id,
            status=payment.status,
            payment_date=payment.payment_date
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/expenses", response_model=List[ExpenseResponse])
def list_expenses(
    branch_id: Optional[uuid.UUID] = Query(None),
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Lists operational expenses (fuel, water chemicals, electricity, repairs)."""
    query = db.query(Expense).filter(Expense.tenant_id == user.tenant_id)
    if branch_id:
        query = query.filter(Expense.branch_id == branch_id)
    return query.order_by(Expense.expense_date.desc()).all()


@router.post("/expenses", response_model=ExpenseResponse)
def create_expense(
    data: ExpenseCreate,
    tenant: Tenant = Depends(get_current_verified_tenant),
    user: User = Depends(require_permission(Permission.EXPENSE_MANAGE)),
    db: Session = Depends(get_db)
):
    """Records an operational plant expense."""
    exp = Expense(
        tenant_id=tenant.id,
        branch_id=data.branch_id,
        category=data.category,
        amount=data.amount,
        payment_mode=data.payment_mode,
        expense_date=data.expense_date,
        description=data.description,
        submitted_by_id=user.id,
        status="approved"
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)
    return exp

