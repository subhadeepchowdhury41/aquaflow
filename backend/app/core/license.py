import uuid
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import Optional
from fastapi import HTTPException, status
from sqlalchemy.orm import Session


class LicenseStatus(str, Enum):
    TRIAL = "trial"
    ACTIVE = "active"
    GRACE_PERIOD = "grace_period"
    EXPIRED = "expired"
    SUSPENDED = "suspended"


def evaluate_tenant_license(
    tenant_status: str,
    license_status: str,
    license_expires_at: Optional[datetime],
    grace_period_days: int = 7
) -> tuple[LicenseStatus, bool, Optional[str]]:
    """Evaluates the live license status of a tenant and determines whether
    business operations should be permitted.

    Returns:
        (calculated_status, is_allowed, restriction_reason)
    """
    # 1. Super Admin independent suspension takes absolute precedence
    if tenant_status == "suspended" or license_status == LicenseStatus.SUSPENDED.value:
        return (
            LicenseStatus.SUSPENDED,
            False,
            "Tenant account has been suspended by Platform Administration. Please contact support."
        )

    # 2. Check Expiry
    if not license_expires_at:
        # No expiry date configured (e.g., unlimited or lifetime internal plan)
        return (LicenseStatus.ACTIVE, True, None)

    now = datetime.now(timezone.utc)
    # Ensure timezone awareness
    if license_expires_at.tzinfo is None:
        license_expires_at = license_expires_at.replace(tzinfo=timezone.utc)

    if now <= license_expires_at:
        # Normal active or trial period
        current = LicenseStatus.TRIAL if license_status == LicenseStatus.TRIAL.value else LicenseStatus.ACTIVE
        return (current, True, None)

    # Expired past license_expires_at, check grace period
    grace_deadline = license_expires_at + timedelta(days=grace_period_days)
    if now <= grace_deadline:
        return (
            LicenseStatus.GRACE_PERIOD,
            True,
            f"License expired on {license_expires_at.strftime('%Y-%m-%d')}. In grace period until {grace_deadline.strftime('%Y-%m-%d')}."
        )

    # Past grace period: Hard cutoff
    return (
        LicenseStatus.EXPIRED,
        False,
        f"Tenant license expired on {license_expires_at.strftime('%Y-%m-%d')} and grace period has ended. All business operations are locked."
    )


def assert_active_license(
    tenant_status: str,
    license_status: str,
    license_expires_at: Optional[datetime],
    grace_period_days: int = 7,
    allow_renewal_endpoints: bool = False
) -> LicenseStatus:
    """FastAPI helper assertion that raises HTTP 402 or 403 if license is not operable."""
    status_calc, allowed, reason = evaluate_tenant_license(
        tenant_status, license_status, license_expires_at, grace_period_days
    )

    if not allowed and not allow_renewal_endpoints:
        if status_calc == LicenseStatus.SUSPENDED:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"message": reason, "code": "TENANT_SUSPENDED"}
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "message": reason,
                    "code": "LICENSE_EXPIRED",
                    "action_required": "RENEW_SUBSCRIPTION"
                }
            )

    return status_calc

