import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class ProductBase(BaseModel):
    name: str
    sku: str
    category: str = "20L_jar"
    description: Optional[str] = None
    unit: str = "jar"
    purchase_cost: float = 0.0
    selling_price: float
    gst_rate: float = 18.0
    hsn_code: Optional[str] = None
    is_returnable: bool = True
    default_deposit: float = 150.0
    is_active: bool = True


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    unit: Optional[str] = None
    purchase_cost: Optional[float] = None
    selling_price: Optional[float] = None
    gst_rate: Optional[float] = None
    hsn_code: Optional[str] = None
    is_returnable: Optional[bool] = None
    default_deposit: Optional[float] = None
    is_active: Optional[bool] = None


class ProductResponse(ProductBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True


class InventoryResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    branch_id: uuid.UUID
    product_id: uuid.UUID
    product_name: Optional[str] = None
    filled_warehouse: int
    empty_warehouse: int
    filled_transit: int
    empty_transit: int
    with_customers: int
    damaged_qty: int
    lost_qty: int
    total_jars: int = 0
    alert_threshold: int

    class Config:
        from_attributes = True


class StockAdjustmentRequest(BaseModel):
    branch_id: uuid.UUID
    product_id: uuid.UUID
    transaction_type: str  # purchase_in, production_fill, damage_writeoff, manual_adjustment
    quantity: int
    target_state: str  # filled_warehouse, empty_warehouse, damaged_qty, lost_qty
    notes: Optional[str] = None


class StockTransferRequest(BaseModel):
    branch_id: uuid.UUID
    product_id: uuid.UUID
    quantity: int
    source_state: str  # e.g., filled_warehouse
    destination_state: str  # e.g., filled_transit
    notes: Optional[str] = None

