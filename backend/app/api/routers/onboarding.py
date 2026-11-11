import re
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import create_access_token, create_refresh_token
from app.core.permissions import get_role_permissions
from app.core.config import settings
from app.models.tenant import Tenant, User
from app.models.platform import SubscriptionPlan
from app.schemas.tenant import TenantOnboardingRequest
from app.schemas.auth import Token
from app.schemas.platform import TenantCreate
from app.services.platform_service import PlatformService

router = APIRouter(prefix="/onboarding", tags=["Tenant Onboarding"])


@router.post("/register", response_model=Token)
def register_and_onboard_tenant(data: TenantOnboardingRequest, db: Session = Depends(get_db)):
    """Self-service tenant onboarding workflow:
    1. Validates and registers new water business.
    2. Provisions default branch and catalogs standard products.
    3. Activates 14-day free trial license.
    4. Automatically logs in the new business owner.
    """
    # Check duplicate email or phone
    existing_tenant = db.query(Tenant).filter(
        (Tenant.email == data.email) | (Tenant.phone == data.phone)
    ).first()
    if existing_tenant:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A business with this email or phone is already registered."
        )

    # Generate clean URL slug from business name
    slug = re.sub(r'[^a-zA-Z0-9]', '-', data.business_name.lower()).strip('-')
    # Check slug collision
    slug_match = db.query(Tenant).filter(Tenant.slug == slug).first()
    if slug_match:
        import secrets
        slug = f"{slug}-{secrets.token_hex(2)}"

    # Match requested subscription plan
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.slug == data.plan_slug).first()
    if not plan:
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.slug == "starter").first()

    tenant_create_data = TenantCreate(
        name=data.business_name,
        slug=slug,
        owner_name=data.owner_name,
        email=data.email,
        phone=data.phone,
        address=data.address,
        gstin=data.gstin,
        business_category=data.business_category,
        plan_id=plan.id if plan else None,
        initial_password=data.password
    )

    tenant = PlatformService.create_tenant(db, tenant_create_data)

    # Fetch owner user
    owner = db.query(User).filter(User.tenant_id == tenant.id, User.role == "tenant_owner").first()
    perms = get_role_permissions(owner.role)

    access_token = create_access_token(
        subject=owner.id,
        tenant_id=tenant.id,
        role=owner.role,
        permissions=perms
    )
    refresh_token = create_refresh_token(subject=owner.id, tenant_id=tenant.id)

    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )

