import uuid
from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel


class DeliveryRouteBase(BaseModel):
    name: str
    description: Optional[str] = None
    branch_id: uuid.UUID
    default_driver_id: Optional[uuid.UUID] = None
    is_active: bool = True


class DeliveryRouteCreate(DeliveryRouteBase):
    pass


class DeliveryRouteResponse(DeliveryRouteBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True


class SubscriptionBase(BaseModel):
    customer_id: uuid.UUID
    product_id: uuid.UUID
    branch_id: uuid.UUID
    route_id: Optional[uuid.UUID] = None
    driver_id: Optional[uuid.UUID] = None
    quantity: int = 1
    schedule_type: str = "daily"  # daily, alternate_days, weekly, weekdays, custom
    schedule_days: List[int] = []
    shift: str = "morning"  # morning, afternoon, evening
    unit_price: float
    start_date: date = date.today()
    end_date: Optional[date] = None


class SubscriptionCreate(SubscriptionBase):
    pass


class SubscriptionResponse(SubscriptionBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    status: str
    pause_start: Optional[date] = None
    pause_resume_date: Optional[date] = None
    created_at: datetime

    class Config:
        from_attributes = True


class DeliveryTaskResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    branch_id: uuid.UUID
    route_id: Optional[uuid.UUID] = None
    driver_id: Optional[uuid.UUID] = None
    customer_id: uuid.UUID
    product_id: uuid.UUID
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    product_name: Optional[str] = None
    scheduled_date: date
    shift: str
    expected_qty: int
    status: str
    sequence_order: int
    idempotency_key: str

    class Config:
        from_attributes = True


class DeliveryRecordCreate(BaseModel):
    delivery_task_id: uuid.UUID
    delivered_qty: int
    empty_collected_qty: int
    cash_collected: float = 0.0
    payment_mode: str = "unpaid"  # unpaid, cash, upi
    delivery_status: str = "delivered"  # delivered, failed, rescheduled
    failure_reason: Optional[str] = None
    notes: Optional[str] = None
    proof_photo_url: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    client_tx_id: Optional[str] = None  # Driver PWA offline transaction ID


class OfflineSyncBatch(BaseModel):
    actions: List[DeliveryRecordCreate]

