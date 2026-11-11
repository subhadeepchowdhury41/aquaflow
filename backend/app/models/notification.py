import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Text, JSON
from app.core.database import TenantAwareModel, GUID


class Notification(TenantAwareModel):
    __tablename__ = "notifications"

    recipient_type = Column(String(50), nullable=False)  # customer, employee, tenant_owner
    recipient_id = Column(GUID(), nullable=False, index=True)
    recipient_contact = Column(String(100), nullable=False)

    channel = Column(String(50), default="whatsapp", nullable=False)  # whatsapp, sms, email, push
    event_type = Column(String(100), nullable=False, index=True)
    # delivery_assigned, delivery_completed, delivery_failed, invoice_generated, payment_received, low_stock, license_expiring

    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    metadata_json = Column(JSON, default=dict, nullable=False)

    status = Column(String(50), default="sent", nullable=False)  # queued, sent, failed
    sent_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

