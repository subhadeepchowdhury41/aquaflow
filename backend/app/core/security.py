import uuid
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Union
from jose import jwt, JWTError
from passlib.context import CryptContext
from app.core.config import settings

# Cryptographic context for password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain password against an existing hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Generates a secure hash for a plain password."""
    return pwd_context.hash(password)


def create_access_token(
    subject: Union[str, uuid.UUID],
    tenant_id: Optional[Union[str, uuid.UUID]] = None,
    role: Optional[str] = None,
    permissions: Optional[list[str]] = None,
    is_super_admin: bool = False,
    is_customer: bool = False,
    expires_delta: Optional[timedelta] = None
) -> str:
    """Generates a signed JWT access token containing security claims."""
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode: Dict[str, Any] = {
        "sub": str(subject),
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "type": "access",
        "is_super_admin": is_super_admin,
        "is_customer": is_customer,
        "role": role,
        "permissions": permissions or []
    }
    if tenant_id:
        to_encode["tenant_id"] = str(tenant_id)

    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def create_refresh_token(
    subject: Union[str, uuid.UUID],
    tenant_id: Optional[Union[str, uuid.UUID]] = None,
    expires_delta: Optional[timedelta] = None
) -> str:
    """Generates a signed JWT refresh token with extended validity."""
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    to_encode: Dict[str, Any] = {
        "sub": str(subject),
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "type": "refresh"
    }
    if tenant_id:
        to_encode["tenant_id"] = str(tenant_id)

    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodes and cryptographically verifies a JWT token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        return None


# OTP Management (Ephemeral in-memory cache with expiry, Redis-ready)
_otp_storage: Dict[str, Dict[str, Any]] = {}


def generate_otp(phone: str, length: int = 6) -> str:
    """Generates a secure numeric OTP for phone authentication with 5-min expiration."""
    # Fixed test OTP for well-known test numbers, otherwise random 6 digits
    if phone in ["+919876543210", "9876543210", "9999999999"]:
        otp_code = "123456"
    else:
        otp_code = f"{secrets.randbelow(900000) + 100000}"

    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
    _otp_storage[phone] = {
        "otp": otp_code,
        "expires_at": expires_at,
        "attempts": 0
    }
    return otp_code


def verify_otp(phone: str, otp: str) -> bool:
    """Verifies submitted OTP and validates expiration."""
    data = _otp_storage.get(phone)
    if not data:
        # Default test pass for dev test numbers
        if phone in ["+919876543210", "9876543210", "9999999999"] and otp == "123456":
            return True
        return False

    if datetime.now(timezone.utc) > data["expires_at"]:
        del _otp_storage[phone]
        return False

    if data["attempts"] >= 5:
        del _otp_storage[phone]
        return False

    data["attempts"] += 1
    if data["otp"] == otp or (phone in ["+919876543210", "9876543210"] and otp == "123456"):
        del _otp_storage[phone]
        return True
    return False

