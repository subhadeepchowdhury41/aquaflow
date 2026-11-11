import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr


class BranchBase(BaseModel):
    name: str
    code: str
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    is_headquarters: bool = False
    is_active: bool = True


class BranchCreate(BranchBase):
    pass


class BranchResponse(BranchBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True


class UserBase(BaseModel):
    email: Optional[EmailStr] = None
    phone: str
    full_name: str
    role: str = "delivery_driver"
    branch_id: Optional[uuid.UUID] = None
    is_active: bool = True


class UserCreate(UserBase):
    password: str


class UserResponse(UserBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True


class TenantOnboardingRequest(BaseModel):
    # Step 1: Business Profile
    business_name: str
    owner_name: str
    email: EmailStr
    phone: str
    password: str
    address: str
    gstin: Optional[str] = None
    business_category: str = "water_jars"

    # Step 2: Configuration
    branch_name: str = "Main Plant"
    default_20l_price: float = 40.0
    default_jar_deposit: float = 150.0
    gst_percentage: float = 18.0

    # Step 3: Subscription Plan
    plan_slug: str = "standard"

