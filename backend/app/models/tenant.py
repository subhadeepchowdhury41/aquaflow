import uuid
from sqlalchemy import Column, String, Boolean, ForeignKey, JSON, Text, Table
from sqlalchemy.orm import relationship
from app.core.database import Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantAwareModel, GUID


# Association table for User <-> Role many-to-many
user_roles_association = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", GUID(), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", GUID(), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
)


class Tenant(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "tenants"

    name = Column(String(255), nullable=False, index=True)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    owner_name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    phone = Column(String(20), unique=True, nullable=False, index=True)
    address = Column(Text, nullable=True)
    gstin = Column(String(20), nullable=True)
    business_category = Column(String(50), default="water_jars", nullable=False)  # water_jars, ro_plant, bulk_water
    status = Column(String(50), default="active", nullable=False, index=True)  # pending, active, suspended, deactivated

    # Subscription link
    plan_id = Column(GUID(), ForeignKey("subscription_plans.id", ondelete="SET NULL"), nullable=True)

    # Settings JSON (GST percentages, invoice prefixes, branding, notification preferences)
    settings = Column(JSON, default=dict, nullable=False)

    # Relationships
    plan = relationship("SubscriptionPlan", back_populates="tenants")
    license = relationship("TenantLicense", back_populates="tenant", uselist=False, cascade="all, delete-orphan")
    branches = relationship("Branch", back_populates="tenant", cascade="all, delete-orphan")
    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    customers = relationship("Customer", back_populates="tenant", cascade="all, delete-orphan")
    products = relationship("Product", back_populates="tenant", cascade="all, delete-orphan")


class Branch(TenantAwareModel):
    __tablename__ = "branches"

    name = Column(String(255), nullable=False)
    code = Column(String(50), nullable=False, index=True)
    address = Column(Text, nullable=True)
    phone = Column(String(20), nullable=True)
    email = Column(String(255), nullable=True)
    is_headquarters = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    # Relationships
    tenant = relationship("Tenant", back_populates="branches")
    users = relationship("User", back_populates="branch")
    customers = relationship("Customer", back_populates="branch")


class Role(TenantAwareModel):
    __tablename__ = "roles"

    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=True)
    is_system_role = Column(Boolean, default=False, nullable=False)
    permissions = Column(JSON, default=list, nullable=False)  # List of permission strings


class User(TenantAwareModel):
    __tablename__ = "users"

    email = Column(String(255), nullable=True, index=True)
    phone = Column(String(20), nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(String(50), default="tenant_owner", nullable=False, index=True)  # SystemRole string
    branch_id = Column(GUID(), ForeignKey("branches.id", ondelete="SET NULL"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    # Relationships
    tenant = relationship("Tenant", back_populates="users")
    branch = relationship("Branch", back_populates="users")
    roles = relationship("Role", secondary=user_roles_association)

