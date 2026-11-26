import uuid
from datetime import date, datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.dependencies import get_current_tenant_user, get_current_verified_tenant, require_permission
from app.core.permissions import Permission
from app.models.tenant import User, Tenant
from app.models.delivery import DeliveryRoute, Subscription, DeliveryTask, DeliveryRecord
from app.models.customer import Customer
from app.models.product import Product
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
    DriverDailyStat
)
from app.services.delivery_service import DeliveryService

router = APIRouter(prefix="/deliveries", tags=["Delivery Operations & Routes"])


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


# --- Daily Delivery Operations ---
@router.post("/generate")
def trigger_daily_delivery_generation(
    target_date: Optional[date] = None,
    tenant: Tenant = Depends(get_current_verified_tenant),
    user: User = Depends(require_permission(Permission.DELIVERY_TASK_GENERATE)),
    db: Session = Depends(get_db)
):
    """Generates today's or specified date's delivery tasks from recurring subscriptions.
    Idempotent: safe to run multiple times without generating duplicate tasks.
    """
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
    """Returns dispatch sheet for delivery drivers or dispatch managers for today or any date."""
    chosen_date = target_date or date.today()
    query = db.query(
        DeliveryTask, Customer, Product, User, DeliveryRecord
    ).join(
        Customer, DeliveryTask.customer_id == Customer.id
    ).join(
        Product, DeliveryTask.product_id == Product.id
    ).outerjoin(
        User, DeliveryTask.driver_id == User.id
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

    results = []
    for task, cust, prod, drv, rec in query.order_by(DeliveryTask.scheduled_date.asc(), DeliveryTask.sequence_order.asc()).all():
        results.append(
            DeliveryTaskResponse(
                id=task.id,
                tenant_id=task.tenant_id,
                branch_id=task.branch_id,
                route_id=task.route_id,
                driver_id=task.driver_id,
                driver_name=drv.full_name if drv else None,
                customer_id=task.customer_id,
                product_id=task.product_id,
                customer_name=cust.name,
                customer_phone=cust.phone,
                customer_address=cust.address,
                delivery_instructions=cust.delivery_instructions,
                customer_balance=cust.current_balance,
                product_name=prod.name,
                product_price=prod.selling_price,
                scheduled_date=task.scheduled_date,
                shift=task.shift,
                expected_qty=task.expected_qty,
                status=task.status,
                sequence_order=task.sequence_order,
                idempotency_key=task.idempotency_key,
                delivered_qty=rec.delivered_qty if rec else None,
                empty_collected_qty=rec.empty_collected_qty if rec else None,
                cash_collected=rec.cash_collected if rec else 0.0,
                payment_mode=rec.payment_mode if rec else None,
                delivered_at=rec.delivered_at if rec else None,
                delivery_notes=rec.notes if rec else None
            )
        )
    return results


@router.get("/driver/completed", response_model=List[DriverCompletedShipmentResponse])
def get_driver_completed_shipments(
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Returns delivery shipments completed or recorded from the driver's end."""
    query = db.query(
        DeliveryRecord, DeliveryTask, Customer, Product
    ).join(
        DeliveryTask, DeliveryRecord.delivery_task_id == DeliveryTask.id
    ).join(
        Customer, DeliveryRecord.customer_id == Customer.id
    ).join(
        Product, DeliveryTask.product_id == Product.id
    ).filter(
        DeliveryRecord.tenant_id == user.tenant_id
    )

    if user.role == "delivery_driver":
        query = query.filter(DeliveryRecord.driver_id == user.id)

    results = []
    for rec, task, cust, prod in query.order_by(DeliveryRecord.delivered_at.desc()).limit(150).all():
        results.append(
            DriverCompletedShipmentResponse(
                id=rec.id,
                task_id=task.id,
                customer_id=cust.id,
                customer_name=cust.name,
                customer_phone=cust.phone,
                customer_address=cust.address,
                product_name=prod.name,
                delivered_qty=rec.delivered_qty,
                empty_collected_qty=rec.empty_collected_qty,
                cash_collected=rec.cash_collected,
                payment_mode=rec.payment_mode,
                delivery_status=rec.delivery_status,
                delivered_at=rec.delivered_at,
                notes=rec.notes
            )
        )
    return results


@router.get("/driver/monthly-report", response_model=DriverMonthlyReportResponse)
def get_driver_monthly_report(
    month: Optional[str] = Query(None, description="Format YYYY-MM"),
    driver_id: Optional[uuid.UUID] = Query(None),
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Aggregates monthly delivery performance metrics for driver PWA and payroll audit."""
    target_month = month or datetime.now(timezone.utc).strftime("%Y-%m")
    target_driver_id = driver_id if (driver_id and user.role != "delivery_driver") else user.id

    driver_user = db.query(User).filter(User.id == target_driver_id).first()
    driver_name = driver_user.full_name if driver_user else "Driver"

    year, mon = [int(x) for x in target_month.split("-")]
    start_dt = date(year, mon, 1)
    if mon == 12:
        end_dt = date(year + 1, 1, 1)
    else:
        end_dt = date(year, mon + 1, 1)

    tasks = db.query(DeliveryTask).filter(
        DeliveryTask.tenant_id == user.tenant_id,
        DeliveryTask.driver_id == target_driver_id,
        DeliveryTask.scheduled_date >= start_dt,
        DeliveryTask.scheduled_date < end_dt
    ).all()

    records = db.query(DeliveryRecord).filter(
        DeliveryRecord.tenant_id == user.tenant_id,
        DeliveryRecord.driver_id == target_driver_id,
        DeliveryRecord.delivered_at >= datetime(year, mon, 1, tzinfo=timezone.utc),
        DeliveryRecord.delivered_at < (datetime(year + 1, 1, 1, tzinfo=timezone.utc) if mon == 12 else datetime(year, mon + 1, 1, tzinfo=timezone.utc))
    ).all()

    total_stops = len(tasks)
    completed_stops = len([t for t in tasks if t.status == "completed"])
    partially_completed_stops = len([t for t in tasks if t.status == "partially_completed"])

    total_jars_delivered = sum(r.delivered_qty for r in records)
    total_empties_collected = sum(r.empty_collected_qty for r in records)
    total_cash_collected = sum(r.cash_collected for r in records)

    successful_stops = completed_stops + partially_completed_stops
    completion_rate = round((successful_stops / total_stops * 100), 1) if total_stops > 0 else 100.0

    daily_dict = {}
    for r in records:
        day_str = r.delivered_at.strftime("%Y-%m-%d")
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


@router.post("/{task_id}/reassign")
def reassign_delivery_task(
    task_id: uuid.UUID,
    data: ReassignTaskRequest,
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Reassigns a delivery task to another driver in the agency/branch."""
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
    if task.status in ["failed", "in_transit"]:
        task.status = "pending"

    db.commit()
    return {
        "success": True,
        "task_id": str(task.id),
        "reassigned_from": old_driver_name,
        "new_driver_id": str(new_driver.id),
        "new_driver_name": new_driver.full_name,
        "message": f"Order successfully reassigned to {new_driver.full_name}"
    }


@router.get("/available-drivers")
def get_available_drivers(
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Lists other active delivery drivers in the agency for transferring orders."""
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

