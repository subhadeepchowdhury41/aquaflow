from fastapi import APIRouter
from app.api.routers import (
    auth,
    platform,
    onboarding,
    tenants,
    customers,
    products,
    deliveries,
    invoices,
    portal
)

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(platform.router)
api_router.include_router(onboarding.router)
api_router.include_router(tenants.router)
api_router.include_router(customers.router)
api_router.include_router(products.router)
api_router.include_router(deliveries.router)
api_router.include_router(invoices.router)
api_router.include_router(portal.router)

