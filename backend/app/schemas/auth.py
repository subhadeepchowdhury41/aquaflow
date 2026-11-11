import uuid
from typing import Optional, List
from pydantic import BaseModel, EmailStr


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class TokenPayload(BaseModel):
    sub: Optional[str] = None
    tenant_id: Optional[str] = None
    role: Optional[str] = None
    is_super_admin: bool = False
    is_customer: bool = False
    permissions: List[str] = []


class LoginRequest(BaseModel):
    email_or_phone: str
    password: str


class OTPRequest(BaseModel):
    phone: str


class OTPVerifyRequest(BaseModel):
    phone: str
    otp: str


class UserProfile(BaseModel):
    id: uuid.UUID
    email: Optional[str]
    phone: str
    full_name: str
    role: str
    tenant_id: Optional[uuid.UUID]
    branch_id: Optional[uuid.UUID]
    is_super_admin: bool = False
    is_active: bool = True
    permissions: List[str] = []

    class Config:
        from_attributes = True

