import uuid
import math
from typing import List, Optional
from datetime import date, datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.dependencies import get_current_tenant_user, get_current_verified_tenant, require_permission
from app.core.permissions import Permission
from app.models.tenant import User, Tenant
from app.models.finance import Invoice, InvoiceItem, Payment, Expense
from app.models.customer import Customer
from app.models.delivery import DeliveryTask
from app.models.product import Product
from app.schemas.finance import (
    InvoiceResponse,
    InvoiceItemSchema,
    InvoiceGenerateMonthlyRequest,
    PaymentCreate,
    PaymentResponse,
    UniversalPaymentItem,
    PaginatedPaymentsResponse,
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
                order_id=inv.order_id,
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
            order_id=payment.order_id,
            shipment_id=payment.shipment_id,
            payment_number=payment.payment_number,
            amount=payment.amount,
            payment_method=payment.payment_method,
            payment_ref_id=payment.payment_ref_id,
            payment_stage=payment.payment_stage,
            status=payment.status,
            payment_date=payment.payment_date,
            notes=payment.notes
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/payments", response_model=List[PaymentResponse])
def list_payments(
    customer_id: Optional[uuid.UUID] = Query(None),
    order_id: Optional[uuid.UUID] = Query(None),
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Lists payments made by customers, optionally filtered by customer_id or order_id."""
    query = db.query(Payment).filter(Payment.tenant_id == user.tenant_id)
    if customer_id:
        query = query.filter(Payment.customer_id == customer_id)
    if order_id:
        query = query.filter(Payment.order_id == order_id)
    payments = query.order_by(Payment.payment_date.desc()).limit(200).all()
    return [
        PaymentResponse(
            id=p.id,
            tenant_id=p.tenant_id,
            customer_id=p.customer_id,
            invoice_id=p.invoice_id,
            order_id=p.order_id,
            shipment_id=p.shipment_id,
            payment_number=p.payment_number,
            amount=p.amount,
            payment_method=p.payment_method,
            payment_ref_id=p.payment_ref_id,
            payment_stage=p.payment_stage or "later",
            status=p.status,
            payment_date=p.payment_date,
            notes=p.notes
        )
        for p in payments
    ]


@router.get("/payments/universal", response_model=PaginatedPaymentsResponse)
def list_universal_payments(
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    search: Optional[str] = Query(None),
    payment_method: Optional[str] = Query(None),
    payment_stage: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Universal paginated payments view with filters and linked order metadata."""
    query = db.query(
        Payment, Customer, Invoice, DeliveryTask, Product, User
    ).join(
        Customer, Payment.customer_id == Customer.id
    ).outerjoin(
        Invoice, Payment.invoice_id == Invoice.id
    ).outerjoin(
        DeliveryTask, Payment.order_id == DeliveryTask.id
    ).outerjoin(
        Product, DeliveryTask.product_id == Product.id
    ).outerjoin(
        User, Payment.collected_by_id == User.id
    ).filter(
        Payment.tenant_id == user.tenant_id
    )

    if payment_method:
        query = query.filter(Payment.payment_method == payment_method)
    if payment_stage:
        query = query.filter(Payment.payment_stage == payment_stage)
    if status_filter:
        query = query.filter(Payment.status == status_filter)
    if date_from:
        dt_start = datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc)
        query = query.filter(Payment.payment_date >= dt_start)
    if date_to:
        dt_end = datetime(date_to.year, date_to.month, date_to.day, tzinfo=timezone.utc) + timedelta(days=1)
        query = query.filter(Payment.payment_date < dt_end)
    if search:
        pat = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Payment.payment_number.ilike(pat),
                Payment.payment_ref_id.ilike(pat),
                Customer.name.ilike(pat),
                Customer.phone.ilike(pat),
                DeliveryTask.order_number.ilike(pat),
                Invoice.invoice_number.ilike(pat),
            )
        )

    total = query.count()
    total_amount_filtered = float(query.with_entities(func.coalesce(func.sum(Payment.amount), 0.0)).scalar() or 0.0)
    total_pages = max(1, math.ceil(total / page_size))

    rows = query.order_by(Payment.payment_date.desc()).offset((page - 1) * page_size).limit(page_size).all()

    items = [
        UniversalPaymentItem(
            id=p.id,
            payment_number=p.payment_number,
            payment_date=p.payment_date,
            amount=p.amount,
            payment_method=p.payment_method,
            payment_ref_id=p.payment_ref_id,
            payment_stage=p.payment_stage or "later",
            status=p.status,
            notes=p.notes,
            customer_id=cust.id,
            customer_name=cust.name,
            customer_phone=cust.phone,
            invoice_id=inv.id if inv else None,
            invoice_number=inv.invoice_number if inv else None,
            order_id=order.id if order else None,
            order_number=order.order_number if order else None,
            order_status=order.status if order else None,
            order_expected_qty=order.expected_qty if order else None,
            order_product_name=prod.name if prod else None,
            order_scheduled_date=order.scheduled_date if order else None,
            collector_name=col.full_name if col else None,
        )
        for p, cust, inv, order, prod, col in rows
    ]

    return PaginatedPaymentsResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        total_amount_filtered=round(total_amount_filtered, 2),
    )


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

