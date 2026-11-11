import uuid
from contextvars import ContextVar
from typing import Optional
from fastapi import HTTPException, status

# Python ContextVar scoping current authenticated tenant context across async task chains
_current_tenant_id: ContextVar[Optional[uuid.UUID]] = ContextVar("current_tenant_id", default=None)
_current_user_id: ContextVar[Optional[uuid.UUID]] = ContextVar("current_user_id", default=None)


def set_tenant_context(tenant_id: Optional[uuid.UUID]) -> None:
    """Sets the current request's tenant ID in the contextvar."""
    _current_tenant_id.set(tenant_id)


def get_tenant_context() -> Optional[uuid.UUID]:
    """Retrieves the current request's tenant ID if set."""
    return _current_tenant_id.get()


def clear_tenant_context() -> None:
    """Clears tenant context after request finishes."""
    _current_tenant_id.set(None)
    _current_user_id.set(None)


def require_tenant_context() -> uuid.UUID:
    """Enforces that the current execution is within an active tenant context.
    Raises HTTP 403 Forbidden if no tenant context is established.
    """
    tenant_id = get_tenant_context()
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant context required for this operation."
        )
    return tenant_id

