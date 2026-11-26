import uuid
import secrets
import hashlib
import math
from datetime import date, datetime, timezone, timedelta
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.dependencies import get_token_payload
from app.models.customer import Customer, CustomerComplaint
from app.models.tenant import Tenant, User
from app.models.delivery import Subscription, DeliveryTask, DeliveryRecord, DeliveryShipment
from app.models.finance import Invoice, Payment, CustomerLedger
from app.models.product import Product
from app.services.billing_service import BillingService
from app.schemas.finance import PaymentCreate

router = APIRouter(prefix="/portal", tags=["Customer Self-Service Portal"])


def get_current_portal_customer(
    payload: dict = Depends(get_token_payload),
    db: Session = Depends(get_db)
) -> Customer:
    """Authenticates the customer from the JWT token claims."""
    customer_id = payload.get("sub")
    if not customer_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )
    customer = db.query(Customer).filter(Customer.id == uuid.UUID(customer_id)).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer account not found")
    return customer


class ExtraOrderRequest(BaseModel):
    product_id: Optional[uuid.UUID] = None
    quantity: int = 1
    delivery_date: date
    shift: str = "morning"  # morning, afternoon, evening
    notes: Optional[str] = None
    pay_now_amount: float = 0.0
    payment_method: str = "upi"
    payment_ref_id: Optional[str] = None


class CustomerServiceTicketRequest(BaseModel):
    category: str  # extra_water, vacation_pause, jar_leakage, damaged_seal, timing_issue, billing_inquiry
    title: str
    description: str


class CustomerOnlinePaymentRequest(BaseModel):
    amount: float
    payment_method: str = "upi"  # upi, razorpay, card, netbanking
    notes: Optional[str] = None


@router.get("/me")
def get_customer_portal_profile(
    customer: Customer = Depends(get_current_portal_customer),
    db: Session = Depends(get_db)
):
    """Returns customer balance, jar balance, active subscriptions, and supplier contact."""
    tenant = db.query(Tenant).filter(Tenant.id == customer.tenant_id).first()
    active_subs = db.query(Subscription).filter(
        Subscription.customer_id == customer.id,
        Subscription.status == "active"
    ).count()

    return {
        "id": customer.id,
        "customer_code": customer.customer_code,
        "name": customer.name,
        "phone": customer.phone,
        "email": customer.email,
        "address": customer.address,
        "category": customer.category,
        "current_balance": customer.current_balance,
        "jar_balance": customer.jar_balance,
        "jar_holding_limit": customer.jar_holding_limit,
        "credit_limit": customer.credit_limit,
        "qr_code_token": customer.qr_code_token,
        "active_subscriptions": active_subs,
        "supplier": {
            "name": tenant.name if tenant else "Water Supplier",
            "phone": tenant.phone if tenant else "",
            "email": tenant.email if tenant else "",
            "address": tenant.address if tenant else "",
            "gstin": tenant.gstin if tenant else ""
        }
    }


@router.get("/deliveries")
def get_customer_deliveries_with_timeline(
    customer: Customer = Depends(get_current_portal_customer),
    db: Session = Depends(get_db)
):
    """Returns past and upcoming deliveries/requests with granular shipment & timeline details."""
    tasks = db.query(DeliveryTask, Product).join(
        Product, DeliveryTask.product_id == Product.id
    ).filter(
        DeliveryTask.customer_id == customer.id
    ).order_by(DeliveryTask.scheduled_date.desc(), DeliveryTask.created_at.desc()).limit(50).all()

    results = []
    for t, p in tasks:
        record = db.query(DeliveryRecord).filter(DeliveryRecord.delivery_task_id == t.id).first()
        shp_rows = db.query(DeliveryShipment, User).outerjoin(
            User, DeliveryShipment.driver_id == User.id
        ).filter(
            DeliveryShipment.order_id == t.id
        ).order_by(DeliveryShipment.created_at.asc()).all()

        driver = db.query(User).filter(User.id == t.driver_id).first() if t.driver_id else None

        invoice = db.query(Invoice).filter(Invoice.order_id == t.id).first()
        order_payments = db.query(Payment).filter(Payment.order_id == t.id, Payment.status == "completed").all()
        paid_amount = round(sum(pm.amount for pm in order_payments), 2)
        total_amount = float(invoice.total_amount) if invoice else float(t.total_amount or 0.0)
        unpaid_amount = 0.0 if t.status in ("rejected", "cancelled") else round(max(0.0, total_amount - paid_amount), 2)

        timeline = [
            {
                "step": "Order Requested" if t.source == "customer_request" else "Order Scheduled",
                "status": "completed",
                "time": (t.created_at.isoformat() if t.created_at else t.scheduled_date.isoformat()),
                "description": f"{t.expected_qty} x {p.name} requested for {t.scheduled_date.isoformat()} ({t.shift} shift)"
            }
        ]

        if t.status == "requested":
            timeline.append({
                "step": "Awaiting Agency Approval",
                "status": "current",
                "time": None,
                "description": "Supplier will review and assign delivery shipment shortly"
            })
        elif t.status == "rejected":
            timeline.append({
                "step": "Request Rejected",
                "status": "failed",
                "time": t.updated_at.isoformat() if t.updated_at else None,
                "description": t.rejection_reason or "Order rejected by agency"
            })

        if shp_rows:
            assigned_names = ", ".join(sorted({d.full_name for _, d in shp_rows if d})) or "Route Executive"
            total_shp_qty = sum(s.assigned_qty for s, _ in shp_rows if s.status != "cancelled")
            timeline.append({
                "step": f"Shipments Assigned ({len(shp_rows)})",
                "status": "completed",
                "time": shp_rows[0][0].created_at.isoformat(),
                "description": f"{total_shp_qty} jars assigned to {assigned_names}"
            })
        elif t.status in ["in_transit", "completed", "partially_completed", "failed"]:
            timeline.append({
                "step": "Dispatched with Driver",
                "status": "completed" if t.status != "in_transit" else "current",
                "time": t.scheduled_date.isoformat(),
                "description": f"Assigned to {driver.full_name if driver else 'Route Executive'}"
            })

        delivered_sum = sum(s.delivered_qty for s, _ in shp_rows if s.status in ("completed", "partially_completed"))
        empty_sum = sum(s.empty_collected_qty for s, _ in shp_rows if s.status in ("completed", "partially_completed"))
        cash_sum = sum(s.cash_collected for s, _ in shp_rows)

        if shp_rows and any(s.delivered_at for s, _ in shp_rows):
            latest_dt = max((s.delivered_at for s, _ in shp_rows if s.delivered_at), default=None)
            timeline.append({
                "step": "Delivered at Doorstep" if t.status == "completed" else "Partially Delivered" if t.status == "partially_completed" else "Delivery Attempt Failed",
                "status": "completed" if t.status in ("completed", "partially_completed") else "failed",
                "time": latest_dt.isoformat() if latest_dt else None,
                "description": f"Delivered: {delivered_sum}/{t.expected_qty} jars | Returned: {empty_sum} empty"
            })
        elif record:
            timeline.append({
                "step": "Delivered at Doorstep" if record.delivery_status == "delivered" else "Delivery Attempt Failed",
                "status": "completed" if record.delivery_status == "delivered" else "failed",
                "time": record.delivered_at.isoformat(),
                "description": (
                    f"Delivered: {record.delivered_qty} jars | Returned: {record.empty_collected_qty} empty"
                    if record.delivery_status == "delivered"
                    else f"Reason: {record.failure_reason or 'Delivery failed'}"
                )
            })

        shipments_summary = [
            {
                "id": str(s.id),
                "shipment_number": s.shipment_number,
                "driver_name": d.full_name if d else "Unassigned",
                "assigned_qty": s.assigned_qty,
                "delivered_qty": s.delivered_qty,
                "empty_collected_qty": s.empty_collected_qty,
                "cash_collected": s.cash_collected,
                "status": s.status,
                "delivered_at": s.delivered_at.isoformat() if s.delivered_at else None,
            }
            for s, d in shp_rows
        ]

        results.append({
            "id": t.id,
            "order_number": t.order_number,
            "scheduled_date": t.scheduled_date,
            "shift": t.shift,
            "product_name": p.name,
            "product_unit": p.unit,
            "expected_qty": t.expected_qty,
            "status": t.status,
            "rejection_reason": t.rejection_reason,
            "total_amount": total_amount,
            "paid_amount": paid_amount,
            "unpaid_amount": unpaid_amount,
            "driver_name": (shp_rows[0][1].full_name if shp_rows and shp_rows[0][1] else (driver.full_name if driver else "Awaiting Assignment")),
            "driver_phone": (shp_rows[0][1].phone if shp_rows and shp_rows[0][1] else (driver.phone if driver else "")),
            "shipments": shipments_summary,
            "record": {
                "delivered_qty": delivered_sum if shp_rows else (record.delivered_qty if record else 0),
                "empty_collected_qty": empty_sum if shp_rows else (record.empty_collected_qty if record else 0),
                "cash_collected": cash_sum if shp_rows else (record.cash_collected if record else 0.0),
                "payment_mode": record.payment_mode if record else "unpaid",
                "delivered_at": record.delivered_at if record else None,
                "notes": record.notes if record else None,
                "failure_reason": record.failure_reason if record else None,
            } if (record or delivered_sum > 0) else None,
            "timeline": timeline
        })

    return results


@router.post("/order-extra")
def request_extra_jars(
    data: ExtraOrderRequest,
    customer: Customer = Depends(get_current_portal_customer),
    db: Session = Depends(get_db)
):
    """Customer requests an extra or on-demand jar order (enters as 'requested' for owner approval)."""
    if data.product_id:
        product = db.query(Product).filter(Product.id == data.product_id, Product.tenant_id == customer.tenant_id).first()
    else:
        product = db.query(Product).filter(Product.tenant_id == customer.tenant_id, Product.sku == "JAR-20L").first()
        if not product:
            product = db.query(Product).filter(Product.tenant_id == customer.tenant_id, Product.is_active == True).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    pricing = BillingService.resolve_order_pricing(
        db, customer.tenant_id, customer.id, product.id, data.quantity
    )

    raw_key = f"{customer.tenant_id}:{customer.id}:{product.id}:{data.delivery_date.isoformat()}:{data.shift}:req-{secrets.token_hex(4)}"
    idempotency_key = hashlib.sha256(raw_key.encode()).hexdigest()
    order_number = f"ORD-{secrets.token_hex(3).upper()}"

    task = DeliveryTask(
        tenant_id=customer.tenant_id,
        branch_id=customer.branch_id,
        route_id=customer.route_id,
        driver_id=None,
        customer_id=customer.id,
        product_id=product.id,
        scheduled_date=data.delivery_date,
        shift=data.shift,
        expected_qty=data.quantity,
        order_number=order_number,
        unit_price=pricing["unit_price"],
        total_amount=pricing["total_amount"],
        notes=data.notes,
        source="customer_request",
        status="requested",
        sequence_order=99,
        idempotency_key=idempotency_key
    )
    db.add(task)
    db.flush()

    if data.pay_now_amount and data.pay_now_amount > 0:
        invoice = BillingService.generate_order_invoice(db, customer.tenant_id, task, auto_commit=False)
        BillingService.record_customer_payment(
            db,
            customer.tenant_id,
            PaymentCreate(
                customer_id=customer.id,
                invoice_id=invoice.id,
                order_id=task.id,
                payment_stage="while_order",
                amount=data.pay_now_amount,
                payment_method=data.payment_method or "upi",
                payment_ref_id=data.payment_ref_id or f"ORDPAY-{secrets.token_hex(3).upper()}",
                notes=f"Paid while placing Order {order_number}"
            ),
            auto_commit=False
        )

    complaint = CustomerComplaint(
        tenant_id=customer.tenant_id,
        customer_id=customer.id,
        title=f"Extra Order Request ({order_number}): {data.quantity} x {product.name}",
        description=f"Requested for {data.delivery_date} ({data.shift} shift). Notes: {data.notes or 'None'}",
        status="open"
    )
    db.add(complaint)

    db.commit()
    return {
        "success": True,
        "message": f"Order request {order_number} for {data.quantity} x {product.name} submitted for owner approval.",
        "task_id": str(task.id),
        "delivery_task_id": str(task.id),
        "order_number": order_number,
        "status": task.status,
    }


@router.get("/requests")
def list_customer_requests(
    customer: Customer = Depends(get_current_portal_customer),
    db: Session = Depends(get_db)
):
    """Tracks customer support requests, vacation pauses, and extra jar tickets."""
    complaints = db.query(CustomerComplaint).filter(
        CustomerComplaint.customer_id == customer.id
    ).order_by(CustomerComplaint.created_at.desc()).all()

    return [
        {
            "id": c.id,
            "title": c.title,
            "description": c.description,
            "status": c.status,
            "resolution_notes": c.resolution_notes,
            "created_at": c.created_at,
            "timeline": [
                {
                    "step": "Request Submitted",
                    "status": "completed",
                    "time": c.created_at.isoformat(),
                    "description": "Logged with plant dispatcher"
                },
                {
                    "step": "Processing & Dispatch",
                    "status": "completed" if c.status in ["in_progress", "resolved", "closed"] else "pending",
                    "time": c.updated_at.isoformat() if c.status != "open" else None,
                    "description": "Under review by agency team"
                },
                {
                    "step": "Resolved / Closed",
                    "status": "completed" if c.status in ["resolved", "closed"] else "pending",
                    "time": c.updated_at.isoformat() if c.status in ["resolved", "closed"] else None,
                    "description": c.resolution_notes or "Awaiting final resolution"
                }
            ]
        }
        for c in complaints
    ]


@router.post("/request")
def submit_service_ticket(
    data: CustomerServiceTicketRequest,
    customer: Customer = Depends(get_current_portal_customer),
    db: Session = Depends(get_db)
):
    """Submits a customer request or complaint with categorized tracking."""
    complaint = CustomerComplaint(
        tenant_id=customer.tenant_id,
        customer_id=customer.id,
        title=f"[{data.category.upper().replace('_', ' ')}] {data.title}",
        description=data.description,
        status="open"
    )
    db.add(complaint)
    db.commit()
    db.refresh(complaint)

    return {
        "success": True,
        "ticket_id": str(complaint.id),
        "status": complaint.status,
        "message": "Ticket created and dispatched to water plant supervisor."
    }


@router.get("/ledger")
def get_customer_due_and_ledger_statement(
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    search: Optional[str] = Query(None),
    direction: Optional[str] = Query(None),  # charge | payment
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    customer: Customer = Depends(get_current_portal_customer),
    db: Session = Depends(get_db)
):
    """Returns paginated & filterable ledger statement showing charges, payments, and running balance."""
    query = db.query(CustomerLedger).filter(
        CustomerLedger.customer_id == customer.id,
        CustomerLedger.tenant_id == customer.tenant_id
    )

    if direction == "charge":
        query = query.filter(CustomerLedger.debit_amount > 0)
    elif direction == "payment":
        query = query.filter(CustomerLedger.credit_amount > 0)

    if date_from:
        dt_start = datetime(date_from.year, date_from.month, date_from.day, tzinfo=timezone.utc)
        query = query.filter(CustomerLedger.transaction_date >= dt_start)
    if date_to:
        dt_end = datetime(date_to.year, date_to.month, date_to.day, tzinfo=timezone.utc) + timedelta(days=1)
        query = query.filter(CustomerLedger.transaction_date < dt_end)

    if search and search.strip():
        pat = f"%{search.strip()}%"
        query = query.filter(
            or_(
                CustomerLedger.notes.ilike(pat),
                CustomerLedger.transaction_type.ilike(pat),
                CustomerLedger.reference_type.ilike(pat),
            )
        )

    total = query.count()
    total_pages = max(1, math.ceil(total / page_size))
    entries = (
        query.order_by(CustomerLedger.transaction_date.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "current_balance": customer.current_balance,
        "jar_balance": customer.jar_balance,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "transactions": [
            {
                "id": e.id,
                "transaction_date": e.transaction_date,
                "transaction_type": e.transaction_type,
                "debit_amount": e.debit_amount,
                "credit_amount": e.credit_amount,
                "running_balance": e.running_balance,
                "notes": e.notes,
                "reference_type": e.reference_type
            }
            for e in entries
        ]
    }


@router.post("/pay")
def pay_customer_dues_online(
    data: CustomerOnlinePaymentRequest,
    customer: Customer = Depends(get_current_portal_customer),
    db: Session = Depends(get_db)
):
    """Customer pays dues online via UPI / Razorpay."""
    if data.amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")

    pay_ref = f"ONLINE-{data.payment_method.upper()}-{secrets.token_hex(4).upper()}"

    from app.schemas.finance import PaymentCreate
    payment_create = PaymentCreate(
        customer_id=customer.id,
        amount=data.amount,
        payment_method=data.payment_method,
        payment_ref_id=pay_ref,
        notes=data.notes or f"Customer online portal payment via {data.payment_method.upper()}"
    )

    payment = BillingService.record_customer_payment(
        db,
        customer.tenant_id,
        payment_create
    )

    return {
        "success": True,
        "payment_id": str(payment.id),
        "payment_number": payment.payment_number,
        "amount_paid": payment.amount,
        "new_balance": customer.current_balance,
        "message": f"Payment of ₹{data.amount:.2f} successfully credited!"
    }


@router.get("/invoices")
def get_customer_invoices(
    customer: Customer = Depends(get_current_portal_customer),
    db: Session = Depends(get_db)
):
    """Returns customer's billing statements and outstanding balances with items."""
    invoices = db.query(Invoice).filter(
        Invoice.customer_id == customer.id
    ).order_by(Invoice.created_at.desc()).all()

    return [
        {
            "id": inv.id,
            "invoice_number": inv.invoice_number,
            "billing_period_start": inv.billing_period_start,
            "billing_period_end": inv.billing_period_end,
            "due_date": inv.due_date,
            "subtotal": inv.subtotal,
            "cgst_amount": inv.cgst_amount,
            "sgst_amount": inv.sgst_amount,
            "total_tax": inv.total_tax,
            "total_amount": inv.total_amount,
            "paid_amount": inv.paid_amount,
            "balance_due": inv.balance_due,
            "status": inv.status,
            "items": [
                {
                    "description": it.description,
                    "quantity": it.quantity,
                    "unit_price": it.unit_price,
                    "tax_amount": it.tax_amount,
                    "total_amount": it.total_amount
                }
                for it in inv.items
            ]
        }
        for inv in invoices
    ]


@router.post("/vacation-pause")
def pause_deliveries(
    resume_date: date,
    customer: Customer = Depends(get_current_portal_customer),
    db: Session = Depends(get_db)
):
    """Customer self-service vacation pause for all active subscriptions."""
    subs = db.query(Subscription).filter(
        Subscription.customer_id == customer.id,
        Subscription.status == "active"
    ).all()

    for s in subs:
        s.status = "paused"
        s.pause_start = date.today()
        s.pause_resume_date = resume_date

    # Record in complaint / request log
    complaint = CustomerComplaint(
        tenant_id=customer.tenant_id,
        customer_id=customer.id,
        title=f"Vacation Pause: Deliveries paused until {resume_date}",
        description=f"Auto-resume date set for {resume_date}",
        status="resolved",
        resolution_notes="Automatic vacation schedule applied"
    )
    db.add(complaint)

    db.commit()
    return {"success": True, "message": f"Deliveries successfully paused until {resume_date}"}
