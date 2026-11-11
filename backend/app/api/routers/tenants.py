import uuid
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_password_hash
from app.api.dependencies import get_current_tenant_user, get_current_verified_tenant, require_permission
from app.core.permissions import Permission
from app.core.license import LicenseStatus, evaluate_tenant_license
from app.models.tenant import Tenant, Branch, User
from app.models.platform import TenantLicense, SubscriptionPlan
from app.schemas.tenant import BranchCreate, BranchResponse, UserCreate, UserResponse
from app.schemas.platform import LicenseResponse

router = APIRouter(prefix="/admin", tags=["Tenant Business Administration"])


@router.get("/profile")
def get_tenant_profile(
    tenant: Tenant = Depends(get_current_verified_tenant),
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Returns the tenant business profile, plan tier, and active license health."""
    lic = db.query(TenantLicense).filter(TenantLicense.tenant_id == tenant.id).first()
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == tenant.plan_id).first() if tenant.plan_id else None

    # Calculate live license evaluation
    calc_status, is_allowed, reason = evaluate_tenant_license(
        tenant_status=tenant.status,
        license_status=lic.status if lic else "trial",
        license_expires_at=lic.expires_at if lic else None,
        grace_period_days=lic.grace_period_days if lic else 7
    )

    return {
        "id": tenant.id,
        "name": tenant.name,
        "slug": tenant.slug,
        "owner_name": tenant.owner_name,
        "email": tenant.email,
        "phone": tenant.phone,
        "address": tenant.address,
        "gstin": tenant.gstin,
        "business_category": tenant.business_category,
        "status": tenant.status,
        "plan_name": plan.name if plan else "Free Trial",
        "license": {
            "key": lic.license_key if lic else "",
            "status": calc_status.value,
            "expires_at": lic.expires_at if lic else None,
            "grace_period_days": lic.grace_period_days if lic else 7,
            "is_operational": is_allowed,
            "restriction_reason": reason
        }
    }


@router.post("/subscriptions/renew")
def renew_tenant_subscription(
    validity_days: int = 30,
    tenant: Tenant = Depends(get_current_verified_tenant),
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Renews or extends the tenant's SaaS subscription (Razorpay checkout mock/integration)."""
    lic = db.query(TenantLicense).filter(TenantLicense.tenant_id == tenant.id).first()
    if not lic:
        raise HTTPException(status_code=404, detail="License record missing")

    now = datetime.now(timezone.utc)
    exp = lic.expires_at
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    base_date = exp if (exp and exp > now) else now
    lic.expires_at = base_date + timedelta(days=validity_days)
    lic.status = LicenseStatus.ACTIVE.value
    db.commit()

    return {
        "success": True,
        "message": f"Subscription successfully renewed for {validity_days} days.",
        "new_expires_at": lic.expires_at
    }


@router.get("/branches", response_model=List[BranchResponse])
def list_branches(
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Lists all operational water distribution branches and RO plants under this tenant."""
    return db.query(Branch).filter(Branch.tenant_id == user.tenant_id).all()


@router.post("/branches", response_model=BranchResponse)
def create_branch(
    data: BranchCreate,
    user: User = Depends(require_permission(Permission.BRANCH_WRITE)),
    tenant: Tenant = Depends(get_current_verified_tenant),
    db: Session = Depends(get_db)
):
    """Creates a new branch for the tenant."""
    branch = Branch(
        tenant_id=tenant.id,
        name=data.name,
        code=data.code,
        address=data.address,
        phone=data.phone,
        email=data.email,
        is_headquarters=data.is_headquarters,
        is_active=data.is_active
    )
    db.add(branch)
    db.commit()
    db.refresh(branch)
    return branch


@router.get("/employees", response_model=List[UserResponse])
def list_employees(
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Lists employees, delivery drivers, and branch managers."""
    return db.query(User).filter(User.tenant_id == user.tenant_id).all()


@router.post("/employees", response_model=UserResponse)
def create_employee(
    data: UserCreate,
    user: User = Depends(require_permission(Permission.STAFF_MANAGE)),
    tenant: Tenant = Depends(get_current_verified_tenant),
    db: Session = Depends(get_db)
):
    """Registers a new staff member or delivery executive."""
    existing = db.query(User).filter(
        (User.phone == data.phone) | (User.email == data.email) if data.email else (User.phone == data.phone)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this email or phone already exists")

    new_user = User(
        tenant_id=tenant.id,
        email=data.email,
        phone=data.phone,
        hashed_password=get_password_hash(data.password),
        full_name=data.full_name,
        role=data.role,
        branch_id=data.branch_id,
        is_active=data.is_active
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user
