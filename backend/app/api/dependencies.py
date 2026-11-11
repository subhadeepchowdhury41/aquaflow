import uuid
from typing import Optional, List, Callable
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_token
from app.core.tenant_context import set_tenant_context, get_tenant_context, clear_tenant_context
from app.core.permissions import Permission, SystemRole, get_role_permissions
from app.core.license import assert_active_license, LicenseStatus
from app.models.tenant import User, Tenant
from app.models.customer import Customer
from app.models.platform import PlatformUser, TenantLicense

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login", auto_error=False)


def get_token_payload(token: Optional[str] = Depends(oauth2_scheme)) -> dict:
    """Validates and decodes the Authorization Bearer JWT token."""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


def get_current_user_or_admin(
    payload: dict = Depends(get_token_payload),
    db: Session = Depends(get_db)
):
    """Retrieves either a PlatformUser (Super Admin) or a Tenant User."""
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token claims")

    is_super_admin = payload.get("is_super_admin", False)
    if is_super_admin:
        admin = db.query(PlatformUser).filter(PlatformUser.id == uuid.UUID(user_id)).first()
        if not admin or not admin.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Super Admin user not found or inactive")
        return admin

    # Check if Consumer / Customer
    is_customer = payload.get("is_customer", False)
    if is_customer:
        customer = db.query(Customer).filter(Customer.id == uuid.UUID(user_id)).first()
        if not customer or not customer.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Customer not found or inactive")
        set_tenant_context(customer.tenant_id)
        return customer

    # Regular Tenant User (Staff, Driver, Owner)
    user = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
    if not user:
        # Fallback check for customer if is_customer flag was omitted
        customer = db.query(Customer).filter(Customer.id == uuid.UUID(user_id)).first()
        if customer and customer.is_active:
            set_tenant_context(customer.tenant_id)
            return customer
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    # Set tenant context
    set_tenant_context(user.tenant_id)
    return user


def get_current_super_admin(
    user=Depends(get_current_user_or_admin)
) -> PlatformUser:
    """Enforces that the current authenticated user is a Platform Super Admin."""
    if not isinstance(user, PlatformUser) or not user.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Admin privileges required"
        )
    return user


def get_current_tenant_user(
    user=Depends(get_current_user_or_admin)
) -> User:
    """Enforces that the current authenticated user belongs to a tenant."""
    if not isinstance(user, User):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant user account required"
        )
    return user


def get_current_verified_tenant(
    request: Request,
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
) -> Tenant:
    """Retrieves tenant record and validates license status against expiration rules.
    Blocks business mutations with HTTP 402 if license is expired.
    """
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant organization not found")

    # Fetch license
    license = db.query(TenantLicense).filter(TenantLicense.tenant_id == tenant.id).first()
    if not license:
        # Default fallback to active if unconfigured (e.g. freshly created)
        return tenant

    # Allow renewal and subscription view endpoints even if expired
    allow_renewal = request.url.path.endswith("/subscriptions/renew") or "/license" in request.url.path or request.method == "GET"

    # Strict license evaluation
    license_status = assert_active_license(
        tenant_status=tenant.status,
        license_status=license.status,
        license_expires_at=license.expires_at,
        grace_period_days=license.grace_period_days,
        allow_renewal_endpoints=allow_renewal
    )

    # Auto-update status in database if computed as expired or grace period
    if license.status != license_status.value:
        license.status = license_status.value
        db.commit()

    return tenant


def require_permission(permission: Permission) -> Callable:
    """Dependency factory verifying that the authenticated user possesses the required permission."""
    def permission_checker(user: User = Depends(get_current_tenant_user)) -> User:
        user_perms = get_role_permissions(user.role)
        # Check custom roles if assigned
        for r in user.roles:
            user_perms.extend(r.permissions)

        if permission.value not in user_perms and SystemRole.TENANT_OWNER.value != user.role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required permission: {permission.value}"
            )
        return user
    return permission_checker

