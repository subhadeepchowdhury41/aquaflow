import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr


class CustomerGroupBase(BaseModel):
    name: str
    description: Optional[str] = None
    discount_percentage: float = 0.0


class CustomerGroupCreate(CustomerGroupBase):
    pass


class CustomerGroupResponse(CustomerGroupBase):
    id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True


class CustomerBase(BaseModel):
    name: str
    phone: str
    alternate_phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    category: str = "residential"
    billing_cycle: str = "monthly"
    branch_id: Optional[uuid.UUID] = None
    group_id: Optional[uuid.UUID] = None
    route_id: Optional[uuid.UUID] = None
    assigned_driver_id: Optional[uuid.UUID] = None
    credit_limit: float = 1000.0
    jar_holding_limit: int = 5
    opening_balance: float = 0.0
    gstin: Optional[str] = None
    delivery_instructions: Optional[str] = None
    is_active: bool = True


class CustomerCreate(CustomerBase):
    customer_code: Optional[str] = None


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    alternate_phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    category: Optional[str] = None
    billing_cycle: Optional[str] = None
    branch_id: Optional[uuid.UUID] = None
    group_id: Optional[uuid.UUID] = None
    route_id: Optional[uuid.UUID] = None
    assigned_driver_id: Optional[uuid.UUID] = None
    credit_limit: Optional[float] = None
    jar_holding_limit: Optional[int] = None
    gstin: Optional[str] = None
    delivery_instructions: Optional[str] = None
    is_active: Optional[bool] = None


class CustomerResponse(CustomerBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    customer_code: str
    current_balance: float
    jar_balance: int
    qr_code_token: str
    created_at: datetime

    class Config:
        from_attributes = True


class CustomerCustomPriceSet(BaseModel):
    product_id: uuid.UUID
    custom_price: float
    custom_deposit: Optional[float] = None

