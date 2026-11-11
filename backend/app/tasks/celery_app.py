from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "aquaflow_worker",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.tasks.periodic"]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "daily-delivery-tasks-generation": {
            "task": "app.tasks.periodic.generate_all_tenants_daily_deliveries",
            "schedule": 86400.0,  # Once daily
        },
        "license-expiry-monitoring": {
            "task": "app.tasks.periodic.monitor_and_enforce_license_expirations",
            "schedule": 3600.0,  # Hourly
        }
    }
)

