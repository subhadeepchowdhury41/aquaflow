import uuid
import secrets
from datetime import date, datetime, timezone, timedelta
from typing import List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.dependencies import get_token_payload
from app.models.customer import Customer, CustomerComplaint
from app.models.tenant import Tenant, User
from app.models.delivery import Subscription, DeliveryTask, DeliveryRecord
from app.models.finance import Invoice, Payment, CustomerLedger
from app.models.product import Product
from app.services.billing_service import BillingService

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
    """Returns past and upcoming deliveries with granular fulfillment timeline details."""
    tasks = db.query(DeliveryTask, Product).join(
        Product, DeliveryTask.product_id == Product.id
    ).filter(
        DeliveryTask.customer_id == customer.id
    ).order_by(DeliveryTask.scheduled_date.desc()).limit(50).all()

    results = []
    for t, p in tasks:
        # Check delivery record
        record = db.query(DeliveryRecord).filter(DeliveryRecord.delivery_task_id == t.id).first()
        driver = db.query(User).filter(User.id == t.driver_id).first() if t.driver_id else None

        timeline = [
            {
                "step": "Order Scheduled",
                "status": "completed",
                "time": t.scheduled_date.isoformat(),
                "description": f"Subscription recurring delivery ({t.expected_qty} {p.unit})"
            }
        ]

        if t.status in ["in_transit", "completed", "partially_completed", "failed"]:
            timeline.append({
                "step": "Dispatched with Driver",
                "status": "completed" if t.status != "in_transit" else "current",
                "time": t.scheduled_date.isoformat(),
                "description": f"Assigned to {driver.full_name if driver else 'Route Executive'}"
            })

        if record:
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

        results.append({
            "id": t.id,
            "scheduled_date": t.scheduled_date,
            "shift": t.shift,
            "product_name": p.name,
            "product_unit": p.unit,
            "expected_qty": t.expected_qty,
            "status": t.status,
            "driver_name": driver.full_name if driver else "Delivery Executive",
            "driver_phone": driver.phone if driver else "",
            "record": {
                "delivered_qty": record.delivered_qty if record else 0,
                "empty_collected_qty": record.empty_collected_qty if record else 0,
                "cash_collected": record.cash_collected if record else 0.0,
                "payment_mode": record.payment_mode if record else "unpaid",
                "delivered_at": record.delivered_at if record else None,
                "notes": record.notes if record else None,
                "failure_reason": record.failure_reason if record else None,
            } if record else None,
            "timeline": timeline
        })

    return results


@router.post("/order-extra")
def request_extra_jars(
    data: ExtraOrderRequest,
    customer: Customer = Depends(get_current_portal_customer),
    db: Session = Depends(get_db)
):
    """Customer requests an extra or on-demand jar delivery stop."""
    # Find 20L jar product or provided product_id
    if data.product_id:
        product = db.query(Product).filter(Product.id == data.product_id, Product.tenant_id == customer.tenant_id).first()
    else:
        product = db.query(Product).filter(Product.tenant_id == customer.tenant_id, Product.sku == "JAR-20L").first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    idempotency_key = f"{customer.tenant_id}:{customer.id}:{product.id}:{data.delivery_date.isoformat()}:{data.shift}:extra-{secrets.token_hex(3)}"

    task = DeliveryTask(
        tenant_id=customer.tenant_id,
        branch_id=customer.branch_id,
        route_id=customer.route_id,
        driver_id=customer.assigned_driver_id,
        customer_id=customer.id,
        product_id=product.id,
        scheduled_date=data.delivery_date,
        shift=data.shift,
        expected_qty=data.quantity,
        status="pending",
        sequence_order=99,
        idempotency_key=idempotency_key
    )
    db.add(task)

    # Also log as customer service request
    complaint = CustomerComplaint(
        tenant_id=customer.tenant_id,
        customer_id=customer.id,
        title=f"Extra Order Request: {data.quantity} x {product.name}",
        description=f"Delivery requested for {data.delivery_date} ({data.shift} shift). Notes: {data.notes or 'None'}",
        status="in_progress"
    )
    db.add(complaint)

    db.commit()
    return {
        "success": True,
        "message": f"Successfully placed order for {data.quantity} extra {product.name} on {data.delivery_date}",
        "task_id": str(task.id)
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
    customer: Customer = Depends(get_current_portal_customer),
    db: Session = Depends(get_db)
):
    """Returns complete ledger statement showing all debits, credits, and running balance."""
    entries = db.query(CustomerLedger).filter(
        CustomerLedger.customer_id == customer.id,
        CustomerLedger.tenant_id == customer.tenant_id
    ).order_by(CustomerLedger.transaction_date.desc()).all()

    return {
        "current_balance": customer.current_balance,
        "jar_balance": customer.jar_balance,
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
