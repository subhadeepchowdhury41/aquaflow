from datetime import date, datetime, timezone, timedelta
from app.tasks.celery_app import celery_app
from app.core.database import SessionLocal
from app.core.license import LicenseStatus
from app.models.tenant import Tenant
from app.models.platform import TenantLicense
from app.services.delivery_service import DeliveryService


@celery_app.task
def generate_all_tenants_daily_deliveries():
    """Daily automated job iterating all active tenants and generating dispatch tasks."""
    db = SessionLocal()
    today = date.today()
    try:
        active_tenants = db.query(Tenant).filter(Tenant.status == "active").all()
        total_tasks = 0
        for tenant in active_tenants:
            # Check license before generating
            lic = db.query(TenantLicense).filter(TenantLicense.tenant_id == tenant.id).first()
            if lic and lic.status == LicenseStatus.EXPIRED.value:
                continue
            tasks = DeliveryService.generate_daily_delivery_tasks(db, tenant.id, today)
            total_tasks += len(tasks)
        return {"status": "success", "date": today.isoformat(), "total_tasks": total_tasks}
    finally:
        db.close()


@celery_app.task
def monitor_and_enforce_license_expirations():
    """Periodic audit enforcing tenant license expirations and grace period transitions."""
    db = SessionLocal()
    now = datetime.now(timezone.utc)
    try:
        licenses = db.query(TenantLicense).all()
        updated = 0
        for lic in licenses:
            if not lic.expires_at:
                continue
            exp = lic.expires_at
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)

            grace_deadline = exp + timedelta(days=lic.grace_period_days)
            if now > grace_deadline and lic.status != LicenseStatus.EXPIRED.value:
                lic.status = LicenseStatus.EXPIRED.value
                updated += 1
            elif exp < now <= grace_deadline and lic.status != LicenseStatus.GRACE_PERIOD.value:
                lic.status = LicenseStatus.GRACE_PERIOD.value
                updated += 1

        db.commit()
        return {"status": "success", "licenses_updated": updated}
    finally:
        db.close()


@celery_app.task
def send_event_notification(recipient: str, channel: str, message: str, event_type: str):
    """Simulates or integrates with WhatsApp Business API / SMS gateway asynchronously."""
    # Production hook: connects to Gupshup / Twilio / Meta Cloud API
    print(f"[{channel.upper()}] Sent to {recipient} ({event_type}): {message}")
    return {"delivered": True, "recipient": recipient, "channel": channel}

