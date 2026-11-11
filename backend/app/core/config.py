import os
from typing import List, Optional
from pydantic_settings import BaseSettings
from pydantic import AnyHttpUrl, field_validator


class Settings(BaseSettings):
    PROJECT_NAME: str = "AquaFlow Multi-Tenant SaaS"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "aquaflow-super-secret-jwt-key-change-in-prod-2026")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day for convenience in dev, configurable
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    ALGORITHM: str = "HS256"

    # Multi-tenant License & Grace Period Defaults
    DEFAULT_TRIAL_DAYS: int = 14
    DEFAULT_GRACE_PERIOD_DAYS: int = 7

    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "sqlite:///./aquaflow.db"
    )
    # Async database URL (for high concurrency if required)
    ASYNC_DATABASE_URL: Optional[str] = os.getenv(
        "ASYNC_DATABASE_URL",
        "postgresql+asyncpg://postgres:postgres@localhost:5432/aquaflow_db"
    )

    # Redis & Celery
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/1")
    CELERY_RESULT_BACKEND: str = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/2")

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:80",
        "http://localhost"
    ]

    # Payment Gateway (Razorpay mock or test keys)
    RAZORPAY_KEY_ID: str = os.getenv("RAZORPAY_KEY_ID", "rzp_test_placeholder_id")
    RAZORPAY_KEY_SECRET: str = os.getenv("RAZORPAY_KEY_SECRET", "rzp_test_placeholder_secret")
    RAZORPAY_WEBHOOK_SECRET: str = os.getenv("RAZORPAY_WEBHOOK_SECRET", "rzp_webhook_secret_default")

    # S3 / Object Storage configuration
    S3_ENDPOINT: Optional[str] = os.getenv("S3_ENDPOINT", None)
    S3_BUCKET_NAME: str = os.getenv("S3_BUCKET_NAME", "aquaflow-storage")
    S3_ACCESS_KEY: Optional[str] = os.getenv("S3_ACCESS_KEY", None)
    S3_SECRET_KEY: Optional[str] = os.getenv("S3_SECRET_KEY", None)

    # Super Admin Bootstrap Credentials
    SUPER_ADMIN_EMAIL: str = os.getenv("SUPER_ADMIN_EMAIL", "superadmin@aquaflow.io")
    SUPER_ADMIN_PASSWORD: str = os.getenv("SUPER_ADMIN_PASSWORD", "Admin@AquaFlow2026!")
    SUPER_ADMIN_NAME: str = "AquaFlow Platform Super Admin"

    class Config:
        case_sensitive = True
        env_file = ".env"
        extra = "allow"


settings = Settings()
