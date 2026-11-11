import uuid
from datetime import date, datetime
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
    OfflineSyncBatch
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
    driver_id: Optional[uuid.UUID] = Query(None),
    route_id: Optional[uuid.UUID] = Query(None),
    status_filter: Optional[str] = Query(None),
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Returns today's dispatch sheet for delivery drivers or dispatch managers."""
    chosen_date = target_date or date.today()
    query = db.query(
        DeliveryTask, Customer, Product
    ).join(
        Customer, DeliveryTask.customer_id == Customer.id
    ).join(
        Product, DeliveryTask.product_id == Product.id
    ).filter(
        DeliveryTask.tenant_id == user.tenant_id,
        DeliveryTask.scheduled_date == chosen_date
    )

    if driver_id:
        query = query.filter(DeliveryTask.driver_id == driver_id)
    if route_id:
        query = query.filter(DeliveryTask.route_id == route_id)
    if status_filter:
        query = query.filter(DeliveryTask.status == status_filter)

    results = []
    for task, cust, prod in query.order_by(DeliveryTask.sequence_order.asc()).all():
        results.append(
            DeliveryTaskResponse(
                id=task.id,
                tenant_id=task.tenant_id,
                branch_id=task.branch_id,
                route_id=task.route_id,
                driver_id=task.driver_id,
                customer_id=task.customer_id,
                product_id=task.product_id,
                customer_name=cust.name,
                customer_phone=cust.phone,
                customer_address=cust.address,
                product_name=prod.name,
                scheduled_date=task.scheduled_date,
                shift=task.shift,
                expected_qty=task.expected_qty,
                status=task.status,
                sequence_order=task.sequence_order,
                idempotency_key=task.idempotency_key
            )
        )
    return results


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

