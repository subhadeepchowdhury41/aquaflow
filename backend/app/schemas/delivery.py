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


class ShipmentSummaryResponse(BaseModel):
    id: uuid.UUID
    shipment_number: str
    order_id: uuid.UUID
    driver_id: Optional[uuid.UUID] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    scheduled_date: date
    shift: str
    assigned_qty: int
    delivered_qty: int = 0
    empty_collected_qty: int = 0
    amount_to_collect: float = 0.0
    cash_collected: float = 0.0
    payment_mode: str = "unpaid"
    status: str
    delivered_at: Optional[datetime] = None
    notes: Optional[str] = None
    failure_reason: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class OrderPaymentSummary(BaseModel):
    id: uuid.UUID
    payment_number: str
    amount: float
    payment_method: str
    payment_ref_id: Optional[str] = None
    payment_stage: str = "later"
    status: str
    payment_date: datetime
    notes: Optional[str] = None
    shipment_id: Optional[uuid.UUID] = None
    collector_name: Optional[str] = None


class AssignShipmentRequest(BaseModel):
    driver_id: uuid.UUID
    assigned_qty: int
    amount_to_collect: Optional[float] = None
    scheduled_date: Optional[date] = None
    shift: Optional[str] = None
    notes: Optional[str] = None


class RejectOrderRequest(BaseModel):
    reason: Optional[str] = None


class OwnerOrderCreateRequest(BaseModel):
    customer_id: uuid.UUID
    product_id: uuid.UUID
    expected_qty: int
    scheduled_date: date
    shift: str = "morning"
    notes: Optional[str] = None
    initial_payment_amount: float = 0.0
    initial_payment_method: str = "cash"
    initial_payment_ref: Optional[str] = None
    shipments: Optional[List[AssignShipmentRequest]] = None


class CompleteShipmentRequest(BaseModel):
    delivered_qty: int
    empty_collected_qty: int
    cash_collected: float = 0.0
    payment_mode: str = "unpaid"
    delivery_status: str = "delivered"  # delivered, failed
    failure_reason: Optional[str] = None
    notes: Optional[str] = None
    client_tx_id: Optional[str] = None


class DriverShipmentResponse(BaseModel):
    """Driver-facing shipment payload: intentionally excludes jar unit prices and customer financial dues."""
    id: uuid.UUID
    shipment_number: str
    order_id: uuid.UUID
    order_number: Optional[str] = None
    customer_id: uuid.UUID
    customer_name: str
    customer_phone: str
    customer_address: str
    delivery_instructions: Optional[str] = None
    customer_jar_balance: int = 0
    product_name: str
    assigned_qty: int
    order_total_qty: int
    amount_to_collect: float = 0.0
    scheduled_date: date
    shift: str
    status: str
    notes: Optional[str] = None


class DeliveryTaskResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    branch_id: uuid.UUID
    route_id: Optional[uuid.UUID] = None
    driver_id: Optional[uuid.UUID] = None
    driver_name: Optional[str] = None
    customer_id: uuid.UUID
    product_id: uuid.UUID
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    delivery_instructions: Optional[str] = None
    customer_balance: Optional[float] = 0.0
    product_name: Optional[str] = None
    product_price: Optional[float] = 40.0
    order_number: Optional[str] = None
    source: Optional[str] = "subscription"
    rejection_reason: Optional[str] = None
    notes: Optional[str] = None
    unit_price: Optional[float] = 0.0
    total_amount: float = 0.0
    paid_amount: float = 0.0
    unpaid_amount: float = 0.0
    invoice_id: Optional[uuid.UUID] = None
    invoice_number: Optional[str] = None
    assigned_qty_total: int = 0
    delivered_qty_total: int = 0
    remaining_assignable_qty: int = 0
    scheduled_date: date
    shift: str
    expected_qty: int
    status: str
    sequence_order: int
    idempotency_key: str
    delivered_qty: Optional[int] = None
    empty_collected_qty: Optional[int] = None
    cash_collected: Optional[float] = 0.0
    payment_mode: Optional[str] = None
    delivered_at: Optional[datetime] = None
    delivery_notes: Optional[str] = None
    shipments: List[ShipmentSummaryResponse] = []
    payments: List[OrderPaymentSummary] = []

    class Config:
        from_attributes = True


class ReassignTaskRequest(BaseModel):
    new_driver_id: uuid.UUID
    notes: Optional[str] = None


class DriverCompletedShipmentResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    customer_id: uuid.UUID
    customer_name: str
    customer_phone: str
    customer_address: str
    product_name: str
    delivered_qty: int
    empty_collected_qty: int
    cash_collected: float
    payment_mode: str
    delivery_status: str
    delivered_at: datetime
    notes: Optional[str] = None


class DriverDailyStat(BaseModel):
    date: str
    delivered_jars: int
    empty_jars: int
    cash_collected: float
    stops_completed: int


class DriverMonthlyReportResponse(BaseModel):
    driver_id: str
    driver_name: str
    month: str
    total_stops: int
    completed_stops: int
    partially_completed_stops: int
    total_jars_delivered: int
    total_empties_collected: int
    total_cash_collected: float
    completion_rate: float
    daily_stats: List[DriverDailyStat]


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

