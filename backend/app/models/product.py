import uuid
from sqlalchemy import Column, String, Boolean, Integer, Float, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from app.core.database import TenantAwareModel, GUID


class Product(TenantAwareModel):
    __tablename__ = "products"

    name = Column(String(255), nullable=False, index=True)
    sku = Column(String(50), nullable=False, index=True)
    category = Column(String(50), default="20L_jar", nullable=False)  # 20L_jar, 1L_bottle, 500ml_bottle, dispenser
    description = Column(Text, nullable=True)
    unit = Column(String(50), default="jar", nullable=False)  # jar, bottle, piece, box

    # Pricing & Taxes
    purchase_cost = Column(Float, default=0.0, nullable=False)
    selling_price = Column(Float, nullable=False)
    gst_rate = Column(Float, default=18.0, nullable=False)  # Percentage (e.g. 18.0%)
    hsn_code = Column(String(50), nullable=True)

    # Returnable Container Tracking
    is_returnable = Column(Boolean, default=True, nullable=False)
    default_deposit = Column(Float, default=150.0, nullable=False)  # e.g., ₹150 deposit for 20L jar
    is_active = Column(Boolean, default=True, nullable=False)

    # Relationships
    tenant = relationship("Tenant", back_populates="products")
    inventories = relationship("Inventory", back_populates="product", cascade="all, delete-orphan")


class Inventory(TenantAwareModel):
    __tablename__ = "inventory"

    branch_id = Column(GUID(), ForeignKey("branches.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(GUID(), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)

    # Multi-state jar balance tracking
    filled_warehouse = Column(Integer, default=0, nullable=False)
    empty_warehouse = Column(Integer, default=0, nullable=False)
    filled_transit = Column(Integer, default=0, nullable=False)    # With drivers on delivery run
    empty_transit = Column(Integer, default=0, nullable=False)     # Collected by drivers, not yet in plant
    with_customers = Column(Integer, default=0, nullable=False)    # Held by customers
    damaged_qty = Column(Integer, default=0, nullable=False)
    lost_qty = Column(Integer, default=0, nullable=False)

    alert_threshold = Column(Integer, default=20, nullable=False)

    product = relationship("Product", back_populates="inventories")
    branch = relationship("Branch")


class InventoryTransaction(TenantAwareModel):
    __tablename__ = "inventory_transactions"

    branch_id = Column(GUID(), ForeignKey("branches.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(GUID(), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)

    transaction_type = Column(String(50), nullable=False, index=True)
    # Types: purchase_in, production_fill, dispatch_driver, return_from_driver, customer_delivered, customer_empty_collected, damage_writeoff, manual_adjustment

    quantity = Column(Integer, nullable=False)
    source_state = Column(String(50), nullable=True)
    destination_state = Column(String(50), nullable=True)

    reference_type = Column(String(50), nullable=True)  # delivery_record, purchase_order, audit
    reference_id = Column(GUID(), nullable=True)
    performed_by_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    notes = Column(Text, nullable=True)

    product = relationship("Product")
    branch = relationship("Branch")

