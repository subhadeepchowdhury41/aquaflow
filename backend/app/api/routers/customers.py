import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.core.database import get_db
from app.api.dependencies import get_current_tenant_user, get_current_verified_tenant, require_permission
from app.core.permissions import Permission
from app.models.tenant import User, Tenant
from app.models.customer import Customer, CustomerGroup, CustomerProductPrice
from app.models.finance import CustomerLedger
from app.schemas.customer import (
    CustomerCreate,
    CustomerUpdate,
    CustomerResponse,
    CustomerGroupCreate,
    CustomerGroupResponse,
    CustomerCustomPriceSet
)
from app.schemas.finance import CustomerLedgerResponse
from app.services.customer_service import CustomerService

router = APIRouter(prefix="/customers", tags=["Customers & Accounts"])


@router.get("", response_model=List[CustomerResponse])
def list_customers(
    search: Optional[str] = Query(None),
    branch_id: Optional[uuid.UUID] = Query(None),
    route_id: Optional[uuid.UUID] = Query(None),
    skip: int = 0,
    limit: int = 100,
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Lists customers for the active tenant with search, filtering, and pagination."""
    query = db.query(Customer).filter(Customer.tenant_id == user.tenant_id)

    if branch_id:
        query = query.filter(Customer.branch_id == branch_id)
    if route_id:
        query = query.filter(Customer.route_id == route_id)
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            or_(
                Customer.name.ilike(search_pattern),
                Customer.phone.ilike(search_pattern),
                Customer.customer_code.ilike(search_pattern),
                Customer.address.ilike(search_pattern)
            )
        )

    return query.order_by(Customer.created_at.desc()).offset(skip).limit(limit).all()


@router.post("", response_model=CustomerResponse)
def create_customer(
    data: CustomerCreate,
    tenant: Tenant = Depends(get_current_verified_tenant),
    user: User = Depends(require_permission(Permission.CUSTOMER_WRITE)),
    db: Session = Depends(get_db)
):
    """Registers a new customer, issues QR code, and establishes initial ledger state."""
    try:
        return CustomerService.create_customer(db, tenant.id, data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{customer_id}", response_model=CustomerResponse)
def get_customer(
    customer_id: uuid.UUID,
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Retrieves full profile for a specific customer."""
    customer = db.query(Customer).filter(
        Customer.id == customer_id,
        Customer.tenant_id == user.tenant_id
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.put("/{customer_id}", response_model=CustomerResponse)
def update_customer(
    customer_id: uuid.UUID,
    data: CustomerUpdate,
    tenant: Tenant = Depends(get_current_verified_tenant),
    user: User = Depends(require_permission(Permission.CUSTOMER_WRITE)),
    db: Session = Depends(get_db)
):
    """Updates customer details, contact, route, or limits."""
    try:
        return CustomerService.update_customer(db, tenant.id, customer_id, data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{customer_id}/ledger", response_model=List[CustomerLedgerResponse])
def get_customer_ledger(
    customer_id: uuid.UUID,
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Returns the immutable financial ledger of debit charges, credit receipts, and running balance."""
    entries = db.query(CustomerLedger).filter(
        CustomerLedger.customer_id == customer_id,
        CustomerLedger.tenant_id == user.tenant_id
    ).order_by(CustomerLedger.transaction_date.desc()).all()
    return entries


@router.post("/{customer_id}/pricing")
def set_customer_product_pricing(
    customer_id: uuid.UUID,
    data: CustomerCustomPriceSet,
    tenant: Tenant = Depends(get_current_verified_tenant),
    user: User = Depends(require_permission(Permission.CUSTOMER_WRITE)),
    db: Session = Depends(get_db)
):
    """Overrides default product price or jar deposit for a high-volume or commercial client."""
    price_rec = CustomerService.set_custom_price(db, tenant.id, customer_id, data)
    return {"success": True, "custom_price": price_rec.custom_price, "custom_deposit": price_rec.custom_deposit}

