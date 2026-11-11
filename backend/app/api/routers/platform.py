import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import create_access_token
from app.api.dependencies import get_current_super_admin
from app.models.platform import PlatformUser, SubscriptionPlan, TenantLicense, PlatformAuditLog
from app.models.tenant import Tenant, Branch, User
from app.models.customer import Customer
from app.schemas.platform import (
    SubscriptionPlanCreate,
    SubscriptionPlanResponse,
    TenantCreate,
    TenantResponse,
    TenantStatusUpdate,
    LicenseIssueRequest,
    LicenseExtendRequest,
    LicenseResponse,
    PlatformDashboardStats
)
from app.services.platform_service import PlatformService

router = APIRouter(prefix="/platform", tags=["Platform SaaS Control Plane"])


@router.get("/dashboard", response_model=PlatformDashboardStats)
def get_dashboard_metrics(
    admin: PlatformUser = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Calculates global SaaS MRR, ARR, active businesses, and churn metrics."""
    return PlatformService.get_platform_dashboard_stats(db)


@router.get("/plans", response_model=List[SubscriptionPlanResponse])
def list_subscription_plans(
    admin: PlatformUser = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Lists all configured SaaS subscription tiers and feature entitlements."""
    return db.query(SubscriptionPlan).order_by(SubscriptionPlan.monthly_price.asc()).all()


@router.post("/plans", response_model=SubscriptionPlanResponse)
def create_subscription_plan(
    data: SubscriptionPlanCreate,
    admin: PlatformUser = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Creates a new SaaS subscription tier with custom customer/staff/branch limits."""
    existing = db.query(SubscriptionPlan).filter(SubscriptionPlan.slug == data.slug).first()
    if existing:
        raise HTTPException(status_code=400, detail="Plan with this slug already exists")

    plan = SubscriptionPlan(**data.model_dump())
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.get("/tenants", response_model=List[TenantResponse])
def list_tenants(
    admin: PlatformUser = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Retrieves all registered water delivery businesses with live license health."""
    tenants = db.query(Tenant).order_by(Tenant.created_at.desc()).all()
    results = []
    for t in tenants:
        cust_cnt = db.query(Customer).filter(Customer.tenant_id == t.id).count()
        emp_cnt = db.query(User).filter(User.tenant_id == t.id).count()
        branch_cnt = db.query(Branch).filter(Branch.tenant_id == t.id).count()

        lic_resp = None
        if t.license:
            lic_resp = LicenseResponse.model_validate(t.license)

        results.append(
            TenantResponse(
                id=t.id,
                name=t.name,
                slug=t.slug,
                owner_name=t.owner_name,
                email=t.email,
                phone=t.phone,
                address=t.address,
                gstin=t.gstin,
                business_category=t.business_category,
                status=t.status,
                plan_id=t.plan_id,
                created_at=t.created_at,
                license=lic_resp,
                customer_count=cust_cnt,
                employee_count=emp_cnt,
                branch_count=branch_cnt
            )
        )
    return results


@router.post("/tenants", response_model=TenantResponse)
def provision_tenant(
    data: TenantCreate,
    admin: PlatformUser = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Manually provisions a new tenant business from the Super Admin portal."""
    try:
        tenant = PlatformService.create_tenant(db, data, actor_id=admin.id)
        return TenantResponse(
            id=tenant.id,
            name=tenant.name,
            slug=tenant.slug,
            owner_name=tenant.owner_name,
            email=tenant.email,
            phone=tenant.phone,
            address=tenant.address,
            gstin=tenant.gstin,
            business_category=tenant.business_category,
            status=tenant.status,
            plan_id=tenant.plan_id,
            created_at=tenant.created_at,
            license=LicenseResponse.model_validate(tenant.license) if tenant.license else None,
            customer_count=0,
            employee_count=1,
            branch_count=1
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/tenants/{tenant_id}/status")
def update_tenant_status(
    tenant_id: uuid.UUID,
    data: TenantStatusUpdate,
    admin: PlatformUser = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Activates, suspends, or deactivates a tenant business."""
    try:
        tenant = PlatformService.update_tenant_status(db, tenant_id, data.status, actor_id=admin.id)
        return {"success": True, "tenant_id": str(tenant.id), "status": tenant.status}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/tenants/{tenant_id}/impersonate")
def impersonate_tenant(
    tenant_id: uuid.UUID,
    admin: PlatformUser = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Issues an audited support impersonation access token to assist tenant."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    owner = db.query(User).filter(User.tenant_id == tenant.id, User.role == "tenant_owner").first()
    if not owner:
        raise HTTPException(status_code=404, detail="Owner user not found for this tenant")

    # Issue token with impersonation claim
    token = create_access_token(
        subject=owner.id,
        tenant_id=tenant.id,
        role=owner.role,
        permissions=["platform:impersonate", "tenant:profile_write"]
    )

    # Log audit event
    audit = PlatformAuditLog(
        actor_id=admin.id,
        actor_email=admin.email,
        action="SUPPORT_IMPERSONATION_STARTED",
        target_type="TENANT",
        target_id=str(tenant.id),
        details={"tenant_name": tenant.name, "impersonated_user": owner.email}
    )
    db.add(audit)
    db.commit()

    return {
        "access_token": token,
        "token_type": "bearer",
        "impersonating": True,
        "tenant_id": str(tenant.id),
        "tenant_name": tenant.name
    }


@router.post("/licenses/extend", response_model=LicenseResponse)
def extend_license(
    tenant_id: uuid.UUID,
    data: LicenseExtendRequest,
    admin: PlatformUser = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Extends tenant license expiry date or grace period."""
    try:
        lic = PlatformService.extend_license(db, tenant_id, data, actor_id=admin.id)
        return LicenseResponse.model_validate(lic)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/audit-logs")
def get_audit_logs(
    admin: PlatformUser = Depends(get_current_super_admin),
    db: Session = Depends(get_db)
):
    """Returns platform-wide security and administrative audit trail."""
    return db.query(PlatformAuditLog).order_by(PlatformAuditLog.created_at.desc()).limit(100).all()

