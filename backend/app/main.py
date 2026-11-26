from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import inspect, text
from app.core.config import settings
from app.core.database import engine, Base, SessionLocal
from app.api.router import api_router
from app.services.platform_service import PlatformService
import app.models  # Ensure all model tables are registered in Base metadata


def _ensure_schema_updates(db_engine, db):
    """Idempotent startup migration adding new columns and backfilling legacy order/shipment links."""
    inspector = inspect(db_engine)
    dialect_name = db_engine.dialect.name
    uuid_col_type = "UUID" if dialect_name == "postgresql" else "CHAR(36)"

    def add_missing_columns(table_name: str, columns: dict[str, str]):
        if not inspector.has_table(table_name):
            return
        existing = {c["name"] for c in inspector.get_columns(table_name)}
        with db_engine.begin() as conn:
            for col_name, col_ddl in columns.items():
                if col_name not in existing:
                    conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_ddl}"))

    add_missing_columns(
        "delivery_tasks",
        {
            "order_number": "VARCHAR(50)",
            "unit_price": "DOUBLE PRECISION" if dialect_name == "postgresql" else "FLOAT",
            "total_amount": ("DOUBLE PRECISION NOT NULL DEFAULT 0.0" if dialect_name == "postgresql" else "FLOAT NOT NULL DEFAULT 0.0"),
            "rejection_reason": "TEXT",
            "notes": "TEXT",
            "source": "VARCHAR(30) NOT NULL DEFAULT 'subscription'",
        },
    )
    add_missing_columns(
        "invoices",
        {
            "order_id": f"{uuid_col_type} REFERENCES delivery_tasks(id) ON DELETE SET NULL",
        },
    )
    add_missing_columns(
        "payments",
        {
            "order_id": f"{uuid_col_type} REFERENCES delivery_tasks(id) ON DELETE SET NULL",
            "shipment_id": f"{uuid_col_type} REFERENCES delivery_shipments(id) ON DELETE SET NULL",
            "payment_stage": "VARCHAR(30) NOT NULL DEFAULT 'later'",
        },
    )

    # Backfill order_number, pricing, and initial shipments for legacy tasks
    from app.models.delivery import DeliveryTask, DeliveryShipment, DeliveryRecord
    from app.models.customer import CustomerProductPrice
    from app.models.product import Product
    import secrets

    tasks = db.query(DeliveryTask).all()
    changed = False
    for t in tasks:
        if not t.order_number:
            t.order_number = f"ORD-{str(t.id)[:6].upper()}"
            changed = True

        if t.unit_price is None or t.total_amount == 0.0:
            prod = db.query(Product).filter(Product.id == t.product_id).first()
            if prod:
                custom = db.query(CustomerProductPrice).filter(
                    CustomerProductPrice.tenant_id == t.tenant_id,
                    CustomerProductPrice.customer_id == t.customer_id,
                    CustomerProductPrice.product_id == t.product_id,
                ).first()
                rate = custom.custom_price if custom else prod.selling_price
                t.unit_price = rate
                subtotal = rate * t.expected_qty
                tax = (subtotal * (prod.gst_rate or 0.0)) / 100.0
                t.total_amount = round(subtotal + tax, 2)
                changed = True

        existing_shipments = db.query(DeliveryShipment).filter(DeliveryShipment.order_id == t.id).count()
        if existing_shipments == 0 and t.driver_id is not None:
            rec = db.query(DeliveryRecord).filter(DeliveryRecord.delivery_task_id == t.id).first()
            shp_status = "assigned"
            if rec:
                if rec.delivery_status == "delivered":
                    shp_status = "completed" if rec.delivered_qty >= t.expected_qty else "partially_completed"
                else:
                    shp_status = "failed"
            shp = DeliveryShipment(
                tenant_id=t.tenant_id,
                order_id=t.id,
                driver_id=rec.driver_id if rec else t.driver_id,
                customer_id=t.customer_id,
                product_id=t.product_id,
                branch_id=t.branch_id,
                shipment_number=f"SHP-{secrets.token_hex(3).upper()}",
                scheduled_date=t.scheduled_date,
                shift=t.shift,
                assigned_qty=t.expected_qty,
                delivered_qty=rec.delivered_qty if rec else 0,
                empty_collected_qty=rec.empty_collected_qty if rec else 0,
                amount_to_collect=0.0,
                cash_collected=rec.cash_collected if rec else 0.0,
                payment_mode=rec.payment_mode if rec else "unpaid",
                status=shp_status,
                failure_reason=rec.failure_reason if rec else None,
                notes=rec.notes if rec else None,
                delivered_at=rec.delivered_at if rec else None,
                client_tx_id=rec.client_tx_id if rec else None,
            )
            db.add(shp)
            changed = True

    if changed:
        db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Try creating tables and seeding initial platform data
    try:
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        try:
            _ensure_schema_updates(engine, db)
            PlatformService.seed_initial_platform_data(db)
        finally:
            db.close()
    except Exception as e:
        print(f"Notice during lifespan startup: {e}")
    yield
    # Shutdown logic if any


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
    lifespan=lifespan
)

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Centralized Exception Handling for clear, consistent API errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    from fastapi import HTTPException
    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "error": exc.detail}
        )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"success": False, "error": str(exc)}
    )

# Register main API router
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/health", tags=["Health"])
def health_check():
    """System health check endpoint for container orchestrators."""
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "api_version": "v1"
    }
