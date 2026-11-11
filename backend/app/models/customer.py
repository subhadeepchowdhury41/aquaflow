import uuid
from sqlalchemy import Column, String, Boolean, Integer, Float, ForeignKey, JSON, Text
from sqlalchemy.orm import relationship
from app.core.database import TenantAwareModel, GUID


class CustomerGroup(TenantAwareModel):
    __tablename__ = "customer_groups"

    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    discount_percentage = Column(Float, default=0.0, nullable=False)

    customers = relationship("Customer", back_populates="group")


class Customer(TenantAwareModel):
    __tablename__ = "customers"

    customer_code = Column(String(50), nullable=False, index=True)
    name = Column(String(255), nullable=False, index=True)
    phone = Column(String(20), nullable=False, index=True)
    alternate_phone = Column(String(20), nullable=True)
    email = Column(String(255), nullable=True)
    address = Column(Text, nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    category = Column(String(50), default="residential", nullable=False)  # residential, commercial, corporate
    billing_cycle = Column(String(50), default="monthly", nullable=False)  # daily, weekly, monthly, prepaid

    # Scoping & Assignment
    branch_id = Column(GUID(), ForeignKey("branches.id", ondelete="SET NULL"), nullable=True, index=True)
    group_id = Column(GUID(), ForeignKey("customer_groups.id", ondelete="SET NULL"), nullable=True)
    route_id = Column(GUID(), ForeignKey("delivery_routes.id", ondelete="SET NULL"), nullable=True, index=True)
    assigned_driver_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Risk & Limits
    credit_limit = Column(Float, default=1000.0, nullable=False)
    jar_holding_limit = Column(Integer, default=5, nullable=False)
    opening_balance = Column(Float, default=0.0, nullable=False)
    current_balance = Column(Float, default=0.0, nullable=False)  # Positive = due from customer, Negative = advance
    jar_balance = Column(Integer, default=0, nullable=False)  # Number of returnable filled/empty jars currently held

    # Tax & Identification
    gstin = Column(String(20), nullable=True)
    delivery_instructions = Column(Text, nullable=True)
    qr_code_token = Column(String(128), unique=True, nullable=False, index=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)

    # Relationships
    tenant = relationship("Tenant", back_populates="customers")
    branch = relationship("Branch", back_populates="customers")
    group = relationship("CustomerGroup", back_populates="customers")
    route = relationship("DeliveryRoute", back_populates="customers")
    custom_prices = relationship("CustomerProductPrice", back_populates="customer", cascade="all, delete-orphan")
    subscriptions = relationship("Subscription", back_populates="customer", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="customer")
    ledger_entries = relationship("CustomerLedger", back_populates="customer")
    complaints = relationship("CustomerComplaint", back_populates="customer")


class CustomerProductPrice(TenantAwareModel):
    __tablename__ = "customer_product_prices"

    customer_id = Column(GUID(), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(GUID(), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    custom_price = Column(Float, nullable=False)
    custom_deposit = Column(Float, nullable=True)

    customer = relationship("Customer", back_populates="custom_prices")
    product = relationship("Product")


class CustomerComplaint(TenantAwareModel):
    __tablename__ = "customer_complaints"

    customer_id = Column(GUID(), ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    status = Column(String(50), default="open", nullable=False)  # open, in_progress, resolved, closed
    resolution_notes = Column(Text, nullable=True)

    customer = relationship("Customer", back_populates="complaints")

