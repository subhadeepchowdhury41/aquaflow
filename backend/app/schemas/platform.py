import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, EmailStr


class SubscriptionPlanBase(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None
    monthly_price: float = 0.0
    annual_price: float = 0.0
    trial_days: int = 14
    grace_period_days: int = 7
    max_customers: int = 100
    max_employees: int = 5
    max_branches: int = 1
    max_storage_mb: int = 1024
    feature_flags: Dict[str, Any] = {}
    is_active: bool = True


class SubscriptionPlanCreate(SubscriptionPlanBase):
    pass


class SubscriptionPlanResponse(SubscriptionPlanBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TenantBase(BaseModel):
    name: str
    slug: str
    owner_name: str
    email: EmailStr
    phone: str
    address: Optional[str] = None
    gstin: Optional[str] = None
    business_category: str = "water_jars"


class TenantCreate(TenantBase):
    plan_id: Optional[uuid.UUID] = None
    initial_password: str = "Password@123"


class TenantStatusUpdate(BaseModel):
    status: str  # active, suspended, deactivated
    reason: Optional[str] = None


class LicenseResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    license_key: str
    status: str
    issued_at: datetime
    expires_at: Optional[datetime]
    grace_period_days: int
    custom_max_customers: Optional[int]
    custom_max_branches: Optional[int]
    custom_max_employees: Optional[int]

    class Config:
        from_attributes = True


class TenantResponse(TenantBase):
    id: uuid.UUID
    status: str
    plan_id: Optional[uuid.UUID] = None
    created_at: datetime
    license: Optional[LicenseResponse] = None
    customer_count: int = 0
    employee_count: int = 0
    branch_count: int = 0

    class Config:
        from_attributes = True


class LicenseIssueRequest(BaseModel):
    tenant_id: uuid.UUID
    plan_id: Optional[uuid.UUID] = None
    validity_days: int = 30
    grace_period_days: int = 7
    notes: Optional[str] = None


class LicenseExtendRequest(BaseModel):
    additional_days: int = 30
    notes: Optional[str] = None


class PlatformDashboardStats(BaseModel):
    total_tenants: int
    active_tenants: int
    trial_tenants: int
    suspended_tenants: int
    mrr: float
    arr: float
    total_revenue: float
    churn_rate: float

