import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, Integer, Float, DateTime, ForeignKey, JSON, Text, Enum
from sqlalchemy.orm import relationship
from app.core.database import Base, UUIDPrimaryKeyMixin, TimestampMixin, GUID


class PlatformUser(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "platform_users"

    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_super_admin = Column(Boolean, default=True, nullable=False)


class SubscriptionPlan(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "subscription_plans"

    name = Column(String(100), unique=True, nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    monthly_price = Column(Float, nullable=False, default=0.0)
    annual_price = Column(Float, nullable=False, default=0.0)
    trial_days = Column(Integer, default=14, nullable=False)
    grace_period_days = Column(Integer, default=7, nullable=False)

    # Entitlement Limits (0 = Unlimited)
    max_customers = Column(Integer, default=100, nullable=False)
    max_employees = Column(Integer, default=5, nullable=False)
    max_branches = Column(Integer, default=1, nullable=False)
    max_storage_mb = Column(Integer, default=1024, nullable=False)

    # Modular feature flags
    feature_flags = Column(JSON, default=dict, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    # Relationships
    tenants = relationship("Tenant", back_populates="plan")


class TenantLicense(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "tenant_licenses"

    tenant_id = Column(GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    license_key = Column(String(128), unique=True, nullable=False, index=True)
    status = Column(String(50), default="trial", nullable=False, index=True)  # trial, active, grace_period, expired, suspended
    issued_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    grace_period_days = Column(Integer, default=7, nullable=False)

    # Dynamic limit overrides
    custom_max_customers = Column(Integer, nullable=True)
    custom_max_branches = Column(Integer, nullable=True)
    custom_max_employees = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)

    # Relationships
    tenant = relationship("Tenant", back_populates="license")


class SubscriptionInvoice(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "subscription_invoices"

    tenant_id = Column(GUID(), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_id = Column(GUID(), ForeignKey("subscription_plans.id", ondelete="RESTRICT"), nullable=False)
    invoice_number = Column(String(50), unique=True, nullable=False, index=True)
    billing_cycle = Column(String(20), default="monthly", nullable=False)  # monthly, annual
    amount = Column(Float, nullable=False, default=0.0)
    tax_amount = Column(Float, nullable=False, default=0.0)
    total_amount = Column(Float, nullable=False, default=0.0)
    status = Column(String(50), default="paid", nullable=False)  # paid, unpaid, refunded
    payment_method = Column(String(50), default="razorpay", nullable=False)
    payment_reference = Column(String(100), nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)


class PlatformAuditLog(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "platform_audit_logs"

    actor_id = Column(GUID(), nullable=True, index=True)
    actor_email = Column(String(255), nullable=True)
    action = Column(String(100), nullable=False, index=True)
    target_type = Column(String(50), nullable=False)
    target_id = Column(String(100), nullable=True)
    ip_address = Column(String(50), nullable=True)
    details = Column(JSON, default=dict, nullable=False)

