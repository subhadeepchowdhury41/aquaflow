import uuid
from datetime import datetime, timezone
from typing import Generator
from sqlalchemy import create_engine, Column, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.types import TypeDecorator, CHAR
from sqlalchemy.orm import declarative_base, sessionmaker, Session, declared_attr
from app.core.config import settings

# Cross-database UUID type support (Native Postgres UUID or String for SQLite tests)
class GUID(TypeDecorator):
    """Platform-independent GUID/UUID type.
    Uses PostgreSQL's native UUID type when available, otherwise CHAR(36).
    """
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PG_UUID(as_uuid=True))
        else:
            return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        elif dialect.name == "postgresql":
            return str(value)
        else:
            if not isinstance(value, uuid.UUID):
                return str(uuid.UUID(str(value)))
            return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        if not isinstance(value, uuid.UUID):
            return uuid.UUID(str(value))
        return value


# Setup database engine
engine_kwargs = {}
if settings.DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_size"] = 20
    engine_kwargs["max_overflow"] = 10

engine = create_engine(settings.DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class TimestampMixin:
    """Provides created_at and updated_at with UTC timestamps."""
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False
    )


class UUIDPrimaryKeyMixin:
    """Provides platform-independent UUID primary key."""
    id = Column(
        GUID(),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
        unique=True
    )


class TenantAwareModel(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Abstract base model for all entities owned by a tenant.
    Enforces strict tenant_id foreign key, indexing, and cascade restrictions.
    """
    __abstract__ = True

    @declared_attr
    def tenant_id(cls):
        return Column(
            GUID(),
            ForeignKey("tenants.id", ondelete="RESTRICT"),
            nullable=False,
            index=True
        )


def get_db() -> Generator[Session, None, None]:
    """Database session dependency for FastAPI request lifecycle."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

