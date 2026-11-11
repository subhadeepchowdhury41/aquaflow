import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import verify_password, create_access_token, create_refresh_token, decode_token, generate_otp, verify_otp
from app.core.permissions import get_role_permissions
from app.core.config import settings
from app.models.tenant import User, Tenant
from app.models.customer import Customer
from app.models.platform import PlatformUser
from app.schemas.auth import LoginRequest, Token, OTPRequest, OTPVerifyRequest, UserProfile
from app.api.dependencies import get_current_user_or_admin

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=Token)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    """Authenticates either a Platform Super Admin or a Tenant User."""
    # 1. Check if Platform Super Admin
    admin = db.query(PlatformUser).filter(PlatformUser.email == data.email_or_phone).first()
    if admin and verify_password(data.password, admin.hashed_password):
        if not admin.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account is deactivated")
        access_token = create_access_token(
            subject=admin.id,
            is_super_admin=True,
            role="super_admin",
            permissions=["platform:super_admin"]
        )
        refresh_token = create_refresh_token(subject=admin.id)
        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        )

    # 2. Check if Tenant User (by email or phone)
    user = db.query(User).filter(
        (User.email == data.email_or_phone) | (User.phone == data.email_or_phone)
    ).first()

    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email/phone or password"
        )

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account is deactivated")

    # Check if Tenant is active
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    if not tenant or tenant.status == "suspended":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant business account is currently suspended"
        )

    perms = get_role_permissions(user.role)
    access_token = create_access_token(
        subject=user.id,
        tenant_id=user.tenant_id,
        role=user.role,
        permissions=perms,
        is_super_admin=False
    )
    refresh_token = create_refresh_token(subject=user.id, tenant_id=user.tenant_id)

    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


@router.post("/refresh", response_model=Token)
def refresh_token(refresh_token: str, db: Session = Depends(get_db)):
    """Refreshes an access token using a valid refresh token."""
    payload = decode_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user_id = payload.get("sub")
    tenant_id = payload.get("tenant_id")

    if not tenant_id:
        # Super admin
        admin = db.query(PlatformUser).filter(PlatformUser.id == uuid.UUID(user_id)).first()
        if not admin or not admin.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive")
        new_access = create_access_token(subject=admin.id, is_super_admin=True, role="super_admin")
        new_refresh = create_refresh_token(subject=admin.id)
    else:
        user = db.query(User).filter(User.id == uuid.UUID(user_id)).first()
        if user and user.is_active:
            perms = get_role_permissions(user.role)
            new_access = create_access_token(
                subject=user.id,
                tenant_id=user.tenant_id,
                role=user.role,
                permissions=perms
            )
            new_refresh = create_refresh_token(subject=user.id, tenant_id=user.tenant_id)
        else:
            customer = db.query(Customer).filter(Customer.id == uuid.UUID(user_id)).first()
            if not customer or not customer.is_active:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User or customer inactive")
            new_access = create_access_token(
                subject=customer.id,
                tenant_id=customer.tenant_id,
                role="customer",
                permissions=["customer:portal_access"],
                is_customer=True
            )
            new_refresh = create_refresh_token(subject=customer.id, tenant_id=customer.tenant_id)

    return Token(
        access_token=new_access,
        refresh_token=new_refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


@router.post("/otp/send")
def send_otp_endpoint(data: OTPRequest):
    """Sends OTP to registered phone number for customer portal or driver login."""
    code = generate_otp(data.phone)
    return {
        "success": True,
        "message": f"OTP sent to {data.phone}",
        "dev_code": code if settings.SECRET_KEY.startswith("aquaflow") else None
    }


@router.post("/otp/verify", response_model=Token)
def verify_otp_endpoint(data: OTPVerifyRequest, db: Session = Depends(get_db)):
    """Verifies phone OTP and returns authentication tokens for driver or customer."""
    verified = verify_otp(data.phone, data.otp)
    if not verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired OTP")

    # Check if Driver/Staff User exists with this phone
    user = db.query(User).filter(User.phone == data.phone, User.is_active == True).first()
    if user:
        perms = get_role_permissions(user.role)
        access_token = create_access_token(
            subject=user.id,
            tenant_id=user.tenant_id,
            role=user.role,
            permissions=perms
        )
        refresh_token = create_refresh_token(subject=user.id, tenant_id=user.tenant_id)
        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        )

    # Check if Customer exists with this phone
    customer = db.query(Customer).filter(Customer.phone == data.phone, Customer.is_active == True).first()
    if customer:
        access_token = create_access_token(
            subject=customer.id,
            tenant_id=customer.tenant_id,
            role="customer",
            permissions=["customer:portal_access"],
            is_customer=True
        )
        refresh_token = create_refresh_token(subject=customer.id, tenant_id=customer.tenant_id)
        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        )

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No registered staff or customer with this phone")


@router.get("/me", response_model=UserProfile)
def get_current_user_profile(user=Depends(get_current_user_or_admin)):
    """Returns the authenticated profile and associated role permissions."""
    if isinstance(user, PlatformUser):
        return UserProfile(
            id=user.id,
            email=user.email,
            phone="",
            full_name=user.full_name,
            role="super_admin",
            tenant_id=None,
            branch_id=None,
            is_super_admin=True,
            is_active=user.is_active,
            permissions=["platform:super_admin"]
        )

    if isinstance(user, Customer):
        return UserProfile(
            id=user.id,
            email=user.email,
            phone=user.phone,
            full_name=user.name,
            role="customer",
            tenant_id=user.tenant_id,
            branch_id=user.branch_id,
            is_super_admin=False,
            is_active=user.is_active,
            permissions=["customer:portal_access"]
        )

    perms = get_role_permissions(user.role)
    return UserProfile(
        id=user.id,
        email=user.email,
        phone=user.phone,
        full_name=user.full_name,
        role=user.role,
        tenant_id=user.tenant_id,
        branch_id=user.branch_id,
        is_super_admin=False,
        is_active=user.is_active,
        permissions=perms
    )

