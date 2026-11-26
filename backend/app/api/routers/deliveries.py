import uuid
import math
from datetime import date, datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.dependencies import get_current_tenant_user, get_current_verified_tenant, require_permission
from app.core.permissions import Permission
from app.models.tenant import User, Tenant
from app.models.delivery import DeliveryRoute, Subscription, DeliveryTask, DeliveryRecord, DeliveryShipment
from app.models.customer import Customer
from app.models.product import Product
from app.models.finance import Invoice, Payment
from app.schemas.delivery import (
    DeliveryRouteCreate,
    DeliveryRouteResponse,
    SubscriptionCreate,
    SubscriptionResponse,
    DeliveryTaskResponse,
    DeliveryRecordCreate,
    OfflineSyncBatch,
    ReassignTaskRequest,
    DriverCompletedShipmentResponse,
    DriverMonthlyReportResponse,
    DriverDailyStat,
    ShipmentSummaryResponse,
    OrderPaymentSummary,
    AssignShipmentRequest,
    RejectOrderRequest,
    OwnerOrderCreateRequest,
    CompleteShipmentRequest,
    DriverShipmentResponse,
    PaginatedOrdersResponse,
)
from app.services.delivery_service import DeliveryService
from app.services.billing_service import BillingService

router = APIRouter(prefix="/deliveries", tags=["Delivery Operations & Routes"])


def _serialize_order(db: Session, task: DeliveryTask, cust: Customer, prod: Product, rec: Optional[DeliveryRecord] = None) -> DeliveryTaskResponse:
    """Builds full Order response with nested shipments, per-order payments, invoice, and qty progress."""
    shp_rows = db.query(DeliveryShipment, User).outerjoin(
        User, DeliveryShipment.driver_id == User.id
    ).filter(
        DeliveryShipment.order_id == task.id,
        DeliveryShipment.tenant_id == task.tenant_id
    ).order_by(DeliveryShipment.created_at.asc()).all()

    shipments_out: List[ShipmentSummaryResponse] = []
    delivered_qty_total = 0
    active_assigned_qty = 0
    total_assigned_non_cancelled = 0

    for shp, drv in shp_rows:
        if shp.status in ("completed", "partially_completed"):
            delivered_qty_total += shp.delivered_qty
            total_assigned_non_cancelled += shp.delivered_qty
        elif shp.status in ("assigned", "in_transit"):
            active_assigned_qty += shp.assigned_qty
            total_assigned_non_cancelled += shp.assigned_qty

        shipments_out.append(
            ShipmentSummaryResponse(
                id=shp.id,
                shipment_number=shp.shipment_number,
                order_id=shp.order_id,
                driver_id=shp.driver_id,
                driver_name=drv.full_name if drv else None,
                driver_phone=drv.phone if drv else None,
                scheduled_date=shp.scheduled_date,
                shift=shp.shift,
                assigned_qty=shp.assigned_qty,
                delivered_qty=shp.delivered_qty,
                empty_collected_qty=shp.empty_collected_qty,
                amount_to_collect=shp.amount_to_collect,
                cash_collected=shp.cash_collected,
                payment_mode=shp.payment_mode,
                status=shp.status,
                delivered_at=shp.delivered_at,
                notes=shp.notes,
                failure_reason=shp.failure_reason,
                created_at=shp.created_at,
            )
        )

    invoice = db.query(Invoice).filter(
        Invoice.order_id == task.id,
        Invoice.tenant_id == task.tenant_id
    ).first()

    pay_rows = db.query(Payment, User).outerjoin(
        User, Payment.collected_by_id == User.id
    ).filter(
        Payment.order_id == task.id,
        Payment.tenant_id == task.tenant_id
    ).order_by(Payment.payment_date.desc()).all()

    payments_out: List[OrderPaymentSummary] = [
        OrderPaymentSummary(
            id=p.id,
            payment_number=p.payment_number,
            amount=p.amount,
            payment_method=p.payment_method,
            payment_ref_id=p.payment_ref_id,
            payment_stage=p.payment_stage,
            status=p.status,
            payment_date=p.payment_date,
            notes=p.notes,
            shipment_id=p.shipment_id,
            collector_name=col.full_name if col else None,
        )
        for p, col in pay_rows
    ]

    if invoice:
        total_amount = float(invoice.total_amount)
    elif task.total_amount and task.total_amount > 0:
        total_amount = float(task.total_amount)
    else:
        pricing = BillingService.resolve_order_pricing(
            db, task.tenant_id, task.customer_id, task.product_id, task.expected_qty
        )
        total_amount = float(pricing["total_amount"])

    paid_amount = round(sum(p.amount for p, _ in pay_rows if p.status == "completed"), 2)
    if task.status in ("rejected", "cancelled"):
        unpaid_amount = 0.0
    else:
        unpaid_amount = round(max(0.0, total_amount - paid_amount), 2)

    remaining_assignable_qty = 0 if task.status in ("rejected", "cancelled", "completed") else max(
        0, task.expected_qty - (delivered_qty_total + active_assigned_qty)
    )

    drv_user = db.query(User).filter(User.id == task.driver_id).first() if task.driver_id else None

    return DeliveryTaskResponse(
        id=task.id,
        tenant_id=task.tenant_id,
        branch_id=task.branch_id,
        route_id=task.route_id,
        driver_id=task.driver_id,
        driver_name=drv_user.full_name if drv_user else None,
        customer_id=task.customer_id,
        product_id=task.product_id,
        customer_name=cust.name,
        customer_phone=cust.phone,
        customer_address=cust.address,
        delivery_instructions=cust.delivery_instructions,
        customer_balance=cust.current_balance,
        product_name=prod.name,
        product_price=task.unit_price or prod.selling_price,
        order_number=task.order_number,
        source=task.source,
        rejection_reason=task.rejection_reason,
        notes=task.notes,
        unit_price=task.unit_price or prod.selling_price,
        total_amount=total_amount,
        paid_amount=paid_amount,
        unpaid_amount=unpaid_amount,
        invoice_id=invoice.id if invoice else None,
        invoice_number=invoice.invoice_number if invoice else None,
        assigned_qty_total=total_assigned_non_cancelled,
        delivered_qty_total=delivered_qty_total,
        remaining_assignable_qty=remaining_assignable_qty,
        scheduled_date=task.scheduled_date,
        shift=task.shift,
        expected_qty=task.expected_qty,
        status=task.status,
        sequence_order=task.sequence_order,
        idempotency_key=task.idempotency_key,
        delivered_qty=rec.delivered_qty if rec else (delivered_qty_total if shipments_out else None),
        empty_collected_qty=rec.empty_collected_qty if rec else (sum(s.empty_collected_qty for s in shipments_out) if shipments_out else None),
        cash_collected=rec.cash_collected if rec else sum(s.cash_collected for s in shipments_out),
        payment_mode=rec.payment_mode if rec else None,
        delivered_at=rec.delivered_at if rec else None,
        delivery_notes=rec.notes if rec else task.notes,
        shipments=shipments_out,
        payments=payments_out,
    )


# --- Delivery Routes ---
@router.get("/routes", response_model=List[DeliveryRouteResponse])
def list_routes(
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Lists delivery routes organized by zones or sectors."""
    return db.query(DeliveryRoute).filter(DeliveryRoute.tenant_id == user.tenant_id).all()


@router.post("/routes", response_model=DeliveryRouteResponse)
def create_route(
    data: DeliveryRouteCreate,
    tenant: Tenant = Depends(get_current_verified_tenant),
    user: User = Depends(require_permission(Permission.BRANCH_WRITE)),
    db: Session = Depends(get_db)
):
    """Creates a new delivery route with assigned default driver."""
    route = DeliveryRoute(tenant_id=tenant.id, **data.model_dump())
    db.add(route)
    db.commit()
    db.refresh(route)
    return route


# --- Subscriptions ---
@router.get("/subscriptions", response_model=List[SubscriptionResponse])
def list_subscriptions(
    customer_id: Optional[uuid.UUID] = Query(None),
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Lists recurring customer subscriptions (daily, alternate-day, weekly)."""
    query = db.query(Subscription).filter(Subscription.tenant_id == user.tenant_id)
    if customer_id:
        query = query.filter(Subscription.customer_id == customer_id)
    return query.all()


@router.post("/subscriptions", response_model=SubscriptionResponse)
def create_subscription(
    data: SubscriptionCreate,
    tenant: Tenant = Depends(get_current_verified_tenant),
    user: User = Depends(require_permission(Permission.SUBSCRIPTION_WRITE)),
    db: Session = Depends(get_db)
):
    """Configures recurring jar delivery schedule for a customer."""
    sub = Subscription(
        tenant_id=tenant.id,
        **data.model_dump(),
        status="active"
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


@router.patch("/subscriptions/{sub_id}/pause")
def pause_subscription(
    sub_id: uuid.UUID,
    resume_date: Optional[date] = None,
    tenant: Tenant = Depends(get_current_verified_tenant),
    user: User = Depends(require_permission(Permission.SUBSCRIPTION_WRITE)),
    db: Session = Depends(get_db)
):
    """Pauses recurring deliveries with automatic resume date (vacation pause)."""
    sub = db.query(Subscription).filter(
        Subscription.id == sub_id,
        Subscription.tenant_id == tenant.id
    ).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    sub.status = "paused"
    sub.pause_start = date.today()
    sub.pause_resume_date = resume_date
    db.commit()

    return {"success": True, "message": "Subscription paused", "resume_date": resume_date}


@router.patch("/subscriptions/{sub_id}/resume")
def resume_subscription(
    sub_id: uuid.UUID,
    tenant: Tenant = Depends(get_current_verified_tenant),
    user: User = Depends(require_permission(Permission.SUBSCRIPTION_WRITE)),
    db: Session = Depends(get_db)
):
    """Resumes paused deliveries immediately."""
    sub = db.query(Subscription).filter(
        Subscription.id == sub_id,
        Subscription.tenant_id == tenant.id
    ).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    sub.status = "active"
    sub.pause_start = None
    sub.pause_resume_date = None
    db.commit()

    return {"success": True, "message": "Subscription resumed"}


# --- Daily Delivery & Order Operations ---
@router.post("/generate")
def trigger_daily_delivery_generation(
    target_date: Optional[date] = None,
    tenant: Tenant = Depends(get_current_verified_tenant),
    user: User = Depends(require_permission(Permission.DELIVERY_TASK_GENERATE)),
    db: Session = Depends(get_db)
):
    """Generates today's or specified date's delivery orders from recurring subscriptions."""
    chosen_date = target_date or date.today()
    tasks = DeliveryService.generate_daily_delivery_tasks(db, tenant.id, chosen_date)
    return {
        "success": True,
        "date": chosen_date,
        "new_tasks_generated": len(tasks),
        "message": f"Generated {len(tasks)} delivery tasks for {chosen_date}"
    }


@router.get("/today", response_model=List[DeliveryTaskResponse])
def get_daily_delivery_tasks(
    target_date: Optional[date] = None,
    all_dates: Optional[bool] = Query(False),
    driver_id: Optional[uuid.UUID] = Query(None),
    route_id: Optional[uuid.UUID] = Query(None),
    status_filter: Optional[str] = Query(None),
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Returns orders & dispatch sheet for owners/dispatch managers for a date or all dates."""
    chosen_date = target_date or date.today()
    query = db.query(
        DeliveryTask, Customer, Product, DeliveryRecord
    ).join(
        Customer, DeliveryTask.customer_id == Customer.id
    ).join(
        Product, DeliveryTask.product_id == Product.id
    ).outerjoin(
        DeliveryRecord, DeliveryTask.id == DeliveryRecord.delivery_task_id
    ).filter(
        DeliveryTask.tenant_id == user.tenant_id
    )

    if not all_dates:
        query = query.filter(DeliveryTask.scheduled_date == chosen_date)

    if driver_id:
        query = query.filter(DeliveryTask.driver_id == driver_id)
    if route_id:
        query = query.filter(DeliveryTask.route_id == route_id)
    if status_filter:
        query = query.filter(DeliveryTask.status == status_filter)

    rows = query.order_by(DeliveryTask.scheduled_date.desc(), DeliveryTask.created_at.desc(), DeliveryTask.sequence_order.asc()).all()
    return [_serialize_order(db, task, cust, prod, rec) for task, cust, prod, rec in rows]


@router.post("/orders", response_model=DeliveryTaskResponse)
def create_owner_order(
    data: OwnerOrderCreateRequest,
    tenant: Tenant = Depends(get_current_verified_tenant),
    user: User = Depends(require_permission(Permission.DELIVERY_TASK_GENERATE)),
    db: Session = Depends(get_db)
):
    """Owner creates a customer order, generates its invoice, and optionally assigns initial shipments."""
    try:
        order = DeliveryService.create_owner_order(db, tenant.id, data, created_by_id=user.id)
        cust = db.query(Customer).filter(Customer.id == order.customer_id).first()
        prod = db.query(Product).filter(Product.id == order.product_id).first()
        return _serialize_order(db, order, cust, prod)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/orders/paginated", response_model=PaginatedOrdersResponse)
def get_paginated_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    target_date: Optional[date] = None,
    all_dates: Optional[bool] = Query(False),
    status_filter: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Returns paginated & filtered orders with cross-page status counts for the owner deliveries board."""
    chosen_date = target_date or date.today()
    base_query = db.query(
        DeliveryTask, Customer, Product, DeliveryRecord
    ).join(
        Customer, DeliveryTask.customer_id == Customer.id
    ).join(
        Product, DeliveryTask.product_id == Product.id
    ).outerjoin(
        DeliveryRecord, DeliveryTask.id == DeliveryRecord.delivery_task_id
    ).filter(
        DeliveryTask.tenant_id == user.tenant_id
    )

    if not all_dates:
        base_query = base_query.filter(DeliveryTask.scheduled_date == chosen_date)

    if search and search.strip():
        pat = f"%{search.strip()}%"
        base_query = base_query.filter(
            or_(
                DeliveryTask.order_number.ilike(pat),
                Customer.name.ilike(pat),
                Customer.phone.ilike(pat),
                Customer.address.ilike(pat),
                Product.name.ilike(pat),
            )
        )

    # Compute status counts from base_query before applying status_filter
    status_rows = (
        base_query.with_entities(DeliveryTask.status, func.count(DeliveryTask.id))
        .group_by(DeliveryTask.status)
        .all()
    )
    status_counts: dict[str, int] = {st: int(cnt) for st, cnt in status_rows}
    status_counts["all"] = sum(status_counts.values())

    filtered_query = base_query
    if status_filter and status_filter != "all":
        filtered_query = filtered_query.filter(DeliveryTask.status == status_filter)

    total = filtered_query.count()
    total_pages = max(1, math.ceil(total / page_size))

    rows = (
        filtered_query.order_by(
            DeliveryTask.scheduled_date.desc(),
            DeliveryTask.created_at.desc(),
            DeliveryTask.sequence_order.asc()
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return PaginatedOrdersResponse(
        items=[_serialize_order(db, task, cust, prod, rec) for task, cust, prod, rec in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        status_counts=status_counts,
    )


@router.get("/orders/{order_id}", response_model=DeliveryTaskResponse)
def get_order_details(
    order_id: uuid.UUID,
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Fetches a single order with its full shipment breakdown and order payment history."""
    row = db.query(
        DeliveryTask, Customer, Product, DeliveryRecord
    ).join(
        Customer, DeliveryTask.customer_id == Customer.id
    ).join(
        Product, DeliveryTask.product_id == Product.id
    ).outerjoin(
        DeliveryRecord, DeliveryTask.id == DeliveryRecord.delivery_task_id
    ).filter(
        DeliveryTask.id == order_id,
        DeliveryTask.tenant_id == user.tenant_id
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Order not found")
    task, cust, prod, rec = row
    return _serialize_order(db, task, cust, prod, rec)


# --- Driver Portal Shipment Endpoints (Strict Financial Privacy) ---
@router.get("/driver/shipments", response_model=List[DriverShipmentResponse])
def get_driver_assigned_shipments(
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Returns active shipments assigned to the driver. Excludes jar prices and customer balance."""
    query = db.query(
        DeliveryShipment, DeliveryTask, Customer, Product
    ).join(
        DeliveryTask, DeliveryShipment.order_id == DeliveryTask.id
    ).join(
        Customer, DeliveryShipment.customer_id == Customer.id
    ).join(
        Product, DeliveryShipment.product_id == Product.id
    ).filter(
        DeliveryShipment.tenant_id == user.tenant_id,
        DeliveryShipment.status.in_(["assigned", "in_transit"]),
        DeliveryTask.status.notin_(["rejected", "cancelled"])
    )

    if user.role == "delivery_driver":
        query = query.filter(DeliveryShipment.driver_id == user.id)

    rows = query.order_by(DeliveryShipment.scheduled_date.asc(), DeliveryShipment.created_at.asc()).all()
    return [
        DriverShipmentResponse(
            id=shp.id,
            shipment_number=shp.shipment_number,
            order_id=order.id,
            order_number=order.order_number,
            customer_id=cust.id,
            customer_name=cust.name,
            customer_phone=cust.phone,
            customer_address=cust.address,
            delivery_instructions=cust.delivery_instructions,
            customer_jar_balance=cust.jar_balance or 0,
            product_name=prod.name,
            assigned_qty=shp.assigned_qty,
            order_total_qty=order.expected_qty,
            amount_to_collect=shp.amount_to_collect,
            scheduled_date=shp.scheduled_date,
            shift=shp.shift,
            status=shp.status,
            notes=shp.notes,
        )
        for shp, order, cust, prod in rows
    ]


@router.get("/driver/completed", response_model=List[DriverCompletedShipmentResponse])
def get_driver_completed_shipments(
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Returns delivery shipments completed or recorded from the driver's end."""
    query = db.query(
        DeliveryShipment, DeliveryTask, Customer, Product
    ).join(
        DeliveryTask, DeliveryShipment.order_id == DeliveryTask.id
    ).join(
        Customer, DeliveryShipment.customer_id == Customer.id
    ).join(
        Product, DeliveryShipment.product_id == Product.id
    ).filter(
        DeliveryShipment.tenant_id == user.tenant_id,
        DeliveryShipment.status.in_(["completed", "partially_completed", "failed"])
    )

    if user.role == "delivery_driver":
        query = query.filter(DeliveryShipment.driver_id == user.id)

    results = []
    for shp, task, cust, prod in query.order_by(DeliveryShipment.delivered_at.desc(), DeliveryShipment.updated_at.desc()).limit(150).all():
        results.append(
            DriverCompletedShipmentResponse(
                id=shp.id,
                task_id=task.id,
                customer_id=cust.id,
                customer_name=cust.name,
                customer_phone=cust.phone,
                customer_address=cust.address,
                product_name=prod.name,
                delivered_qty=shp.delivered_qty,
                empty_collected_qty=shp.empty_collected_qty,
                cash_collected=shp.cash_collected,
                payment_mode=shp.payment_mode,
                delivery_status="delivered" if shp.status in ("completed", "partially_completed") else "failed",
                delivered_at=shp.delivered_at or shp.updated_at,
                notes=shp.notes
            )
        )
    return results


@router.get("/driver/monthly-report", response_model=DriverMonthlyReportResponse)
def get_driver_monthly_report(
    month: Optional[str] = Query(None, description="YYYY-MM format"),
    driver_id: Optional[uuid.UUID] = Query(None),
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Returns monthly performance and daily breakdown metrics for a driver's shipments."""
    target_month = month or datetime.now(timezone.utc).strftime("%Y-%m")
    target_driver_id = driver_id if (driver_id and user.role != "delivery_driver") else user.id

    driver_user = db.query(User).filter(User.id == target_driver_id).first()
    driver_name = driver_user.full_name if driver_user else "Driver"

    year, mon = [int(x) for x in target_month.split("-")]
    start_dt = date(year, mon, 1)
    end_dt = date(year + 1, 1, 1) if mon == 12 else date(year, mon + 1, 1)

    shipments = db.query(DeliveryShipment).filter(
        DeliveryShipment.tenant_id == user.tenant_id,
        DeliveryShipment.driver_id == target_driver_id,
        DeliveryShipment.scheduled_date >= start_dt,
        DeliveryShipment.scheduled_date < end_dt,
        DeliveryShipment.status != "cancelled"
    ).all()

    total_stops = len(shipments)
    completed_stops = len([s for s in shipments if s.status == "completed"])
    partially_completed_stops = len([s for s in shipments if s.status == "partially_completed"])

    completed_records = [s for s in shipments if s.status in ("completed", "partially_completed")]
    total_jars_delivered = sum(r.delivered_qty for r in completed_records)
    total_empties_collected = sum(r.empty_collected_qty for r in completed_records)
    total_cash_collected = sum(r.cash_collected for r in completed_records)

    successful_stops = completed_stops + partially_completed_stops
    completion_rate = round((successful_stops / total_stops * 100), 1) if total_stops > 0 else 100.0

    daily_dict = {}
    for r in completed_records:
        dt_ref = r.delivered_at.date() if r.delivered_at else r.scheduled_date
        day_str = dt_ref.strftime("%Y-%m-%d")
        if day_str not in daily_dict:
            daily_dict[day_str] = {"delivered": 0, "empty": 0, "cash": 0.0, "stops": 0}
        daily_dict[day_str]["delivered"] += r.delivered_qty
        daily_dict[day_str]["empty"] += r.empty_collected_qty
        daily_dict[day_str]["cash"] += r.cash_collected
        daily_dict[day_str]["stops"] += 1

    daily_stats = [
        DriverDailyStat(
            date=d,
            delivered_jars=v["delivered"],
            empty_jars=v["empty"],
            cash_collected=round(v["cash"], 2),
            stops_completed=v["stops"]
        )
        for d, v in sorted(daily_dict.items())
    ]

    return DriverMonthlyReportResponse(
        driver_id=str(target_driver_id),
        driver_name=driver_name,
        month=target_month,
        total_stops=total_stops,
        completed_stops=completed_stops,
        partially_completed_stops=partially_completed_stops,
        total_jars_delivered=total_jars_delivered,
        total_empties_collected=total_empties_collected,
        total_cash_collected=round(total_cash_collected, 2),
        completion_rate=completion_rate,
        daily_stats=daily_stats
    )


@router.get("/available-drivers")
def get_available_drivers(
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Lists active delivery drivers in the agency for assigning shipments."""
    drivers = db.query(User).filter(
        User.tenant_id == user.tenant_id,
        User.role == "delivery_driver",
        User.is_active == True
    ).all()
    return [
        {
            "id": str(d.id),
            "name": d.full_name,
            "phone": d.phone,
            "is_current": (d.id == user.id)
        }
        for d in drivers
    ]


@router.post("/shipments/{shipment_id}/complete")
def complete_driver_shipment(
    shipment_id: uuid.UUID,
    data: CompleteShipmentRequest,
    tenant: Tenant = Depends(get_current_verified_tenant),
    user: User = Depends(require_permission(Permission.DELIVERY_RECORD)),
    db: Session = Depends(get_db)
):
    """Marks a shipment completed/partially completed/failed, collects cash, and updates parent order."""
    try:
        shp = DeliveryService.complete_shipment(db, tenant.id, shipment_id, data, driver_id=user.id)
        return {
            "success": True,
            "shipment_id": str(shp.id),
            "order_id": str(shp.order_id),
            "status": shp.status,
            "delivered_qty": shp.delivered_qty,
            "empty_collected": shp.empty_collected_qty,
            "cash_collected": shp.cash_collected,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/shipments/{shipment_id}/reassign")
def reassign_shipment(
    shipment_id: uuid.UUID,
    data: ReassignTaskRequest,
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Transfers an active shipment to another driver."""
    shp = db.query(DeliveryShipment).filter(
        DeliveryShipment.id == shipment_id,
        DeliveryShipment.tenant_id == user.tenant_id
    ).first()
    if not shp:
        raise HTTPException(status_code=404, detail="Shipment not found")

    new_driver = db.query(User).filter(
        User.id == data.new_driver_id,
        User.tenant_id == user.tenant_id,
        User.is_active == True
    ).first()
    if not new_driver:
        raise HTTPException(status_code=404, detail="Selected driver not found or inactive")

    shp.driver_id = new_driver.id
    if shp.status in ("failed", "in_transit"):
        shp.status = "assigned"
    if data.notes:
        shp.notes = data.notes
    db.commit()

    return {
        "success": True,
        "shipment_id": str(shp.id),
        "new_driver_id": str(new_driver.id),
        "new_driver_name": new_driver.full_name,
        "message": f"Shipment {shp.shipment_number} reassigned to {new_driver.full_name}"
    }


@router.post("/{order_id}/shipments", response_model=ShipmentSummaryResponse)
def assign_order_shipment(
    order_id: uuid.UUID,
    data: AssignShipmentRequest,
    tenant: Tenant = Depends(get_current_verified_tenant),
    user: User = Depends(require_permission(Permission.DELIVERY_TASK_GENERATE)),
    db: Session = Depends(get_db)
):
    """Owner assigns a shipment (chosen driver, jar count, amount to collect) for an order."""
    try:
        shp = DeliveryService.assign_shipment(db, tenant.id, order_id, data)
        drv = db.query(User).filter(User.id == shp.driver_id).first()
        return ShipmentSummaryResponse(
            id=shp.id,
            shipment_number=shp.shipment_number,
            order_id=shp.order_id,
            driver_id=shp.driver_id,
            driver_name=drv.full_name if drv else None,
            driver_phone=drv.phone if drv else None,
            scheduled_date=shp.scheduled_date,
            shift=shp.shift,
            assigned_qty=shp.assigned_qty,
            delivered_qty=shp.delivered_qty,
            empty_collected_qty=shp.empty_collected_qty,
            amount_to_collect=shp.amount_to_collect,
            cash_collected=shp.cash_collected,
            payment_mode=shp.payment_mode,
            status=shp.status,
            delivered_at=shp.delivered_at,
            notes=shp.notes,
            failure_reason=shp.failure_reason,
            created_at=shp.created_at,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{order_id}/reject")
def reject_customer_order(
    order_id: uuid.UUID,
    data: RejectOrderRequest,
    tenant: Tenant = Depends(get_current_verified_tenant),
    user: User = Depends(require_permission(Permission.DELIVERY_TASK_GENERATE)),
    db: Session = Depends(get_db)
):
    """Owner rejects a requested or pending order."""
    try:
        order = DeliveryService.reject_order(db, tenant.id, order_id, reason=data.reason)
        return {
            "success": True,
            "order_id": str(order.id),
            "status": order.status,
            "rejection_reason": order.rejection_reason,
            "message": f"Order {order.order_number or ''} rejected"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{task_id}/reassign")
def reassign_delivery_task(
    task_id: uuid.UUID,
    data: ReassignTaskRequest,
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Reassigns a delivery order/task (and its active shipment) to another driver."""
    task = db.query(DeliveryTask).filter(
        DeliveryTask.id == task_id,
        DeliveryTask.tenant_id == user.tenant_id
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Delivery task not found")

    new_driver = db.query(User).filter(
        User.id == data.new_driver_id,
        User.tenant_id == user.tenant_id,
        User.is_active == True
    ).first()
    if not new_driver:
        raise HTTPException(status_code=404, detail="Selected driver not found or inactive")

    old_driver_name = task.driver.full_name if task.driver else "Unassigned"
    task.driver_id = new_driver.id
    if task.status in ["failed", "in_transit", "requested", "pending"]:
        task.status = "assigned"

    # Also update or create active shipment for backward compatibility
    active_shp = db.query(DeliveryShipment).filter(
        DeliveryShipment.order_id == task.id,
        DeliveryShipment.status.in_(["assigned", "in_transit"])
    ).first()
    if active_shp:
        active_shp.driver_id = new_driver.id

    db.commit()
    return {
        "success": True,
        "task_id": str(task.id),
        "reassigned_from": old_driver_name,
        "new_driver_id": str(new_driver.id),
        "new_driver_name": new_driver.full_name,
        "message": f"Order successfully reassigned to {new_driver.full_name}"
    }


@router.post("/record")
def record_delivery_stop(
    data: DeliveryRecordCreate,
    tenant: Tenant = Depends(get_current_verified_tenant),
    user: User = Depends(require_permission(Permission.DELIVERY_RECORD)),
    db: Session = Depends(get_db)
):
    """Records completion of a delivery stop, adjusting jar balance, inventory, and ledger."""
    try:
        rec = DeliveryService.record_delivery_execution(db, tenant.id, data, driver_id=user.id)
        return {
            "success": True,
            "delivery_record_id": str(rec.id),
            "status": rec.delivery_status,
            "delivered_qty": rec.delivered_qty,
            "empty_collected": rec.empty_collected_qty,
            "cash_collected": rec.cash_collected
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/sync")
def sync_offline_delivery_actions(
    batch: OfflineSyncBatch,
    tenant: Tenant = Depends(get_current_verified_tenant),
    user: User = Depends(require_permission(Permission.DELIVERY_RECORD)),
    db: Session = Depends(get_db)
):
    """Processes bulk offline actions submitted by the Driver PWA when network is restored."""
    processed = 0
    errors = []
    for item in batch.actions:
        try:
            DeliveryService.record_delivery_execution(db, tenant.id, item, driver_id=user.id)
            processed += 1
        except Exception as e:
            errors.append({"client_tx_id": item.client_tx_id, "error": str(e)})

    return {
        "success": True,
        "processed_count": processed,
        "errors": errors
    }
