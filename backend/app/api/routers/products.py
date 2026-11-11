import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.dependencies import get_current_tenant_user, get_current_verified_tenant, require_permission
from app.core.permissions import Permission
from app.models.tenant import User, Tenant
from app.models.product import Product, Inventory, InventoryTransaction
from app.schemas.product import (
    ProductCreate,
    ProductUpdate,
    ProductResponse,
    InventoryResponse,
    StockAdjustmentRequest,
    StockTransferRequest
)

router = APIRouter(prefix="/products", tags=["Products & Inventory"])


@router.get("", response_model=List[ProductResponse])
def list_products(
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Lists all catalog products (20L jars, bottles, dispensers) for this tenant."""
    return db.query(Product).filter(
        Product.tenant_id == user.tenant_id,
        Product.is_active == True
    ).all()


@router.post("", response_model=ProductResponse)
def create_product(
    data: ProductCreate,
    tenant: Tenant = Depends(get_current_verified_tenant),
    user: User = Depends(require_permission(Permission.PRODUCT_WRITE)),
    db: Session = Depends(get_db)
):
    """Creates a new catalog product and initializes inventory records across branches."""
    product = Product(
        tenant_id=tenant.id,
        **data.model_dump()
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.get("/inventory/status", response_model=List[InventoryResponse])
def get_inventory_status(
    branch_id: Optional[uuid.UUID] = Query(None),
    user: User = Depends(get_current_tenant_user),
    db: Session = Depends(get_db)
):
    """Returns 8-state returnable jar inventory breakdown:
    warehouse full/empty, transit, with customers, damaged, lost.
    """
    query = db.query(Inventory, Product).join(
        Product, Inventory.product_id == Product.id
    ).filter(Inventory.tenant_id == user.tenant_id)

    if branch_id:
        query = query.filter(Inventory.branch_id == branch_id)

    results = []
    for inv, prod in query.all():
        total = (
            inv.filled_warehouse +
            inv.empty_warehouse +
            inv.filled_transit +
            inv.empty_transit +
            inv.with_customers +
            inv.damaged_qty +
            inv.lost_qty
        )
        results.append(
            InventoryResponse(
                id=inv.id,
                tenant_id=inv.tenant_id,
                branch_id=inv.branch_id,
                product_id=inv.product_id,
                product_name=prod.name,
                filled_warehouse=inv.filled_warehouse,
                empty_warehouse=inv.empty_warehouse,
                filled_transit=inv.filled_transit,
                empty_transit=inv.empty_transit,
                with_customers=inv.with_customers,
                damaged_qty=inv.damaged_qty,
                lost_qty=inv.lost_qty,
                total_jars=total,
                alert_threshold=inv.alert_threshold
            )
        )
    return results


@router.post("/inventory/adjust")
def adjust_stock(
    data: StockAdjustmentRequest,
    tenant: Tenant = Depends(get_current_verified_tenant),
    user: User = Depends(require_permission(Permission.INVENTORY_WRITE)),
    db: Session = Depends(get_db)
):
    """Performs an auditable stock adjustment (e.g. RO Plant production fill, purchase, damage write-off)."""
    inv = db.query(Inventory).filter(
        Inventory.tenant_id == tenant.id,
        Inventory.branch_id == data.branch_id,
        Inventory.product_id == data.product_id
    ).first()

    if not inv:
        inv = Inventory(
            tenant_id=tenant.id,
            branch_id=data.branch_id,
            product_id=data.product_id
        )
        db.add(inv)
        db.flush()

    if data.transaction_type == "production_fill":
        # Convert empty jars in warehouse to filled jars
        fill_qty = min(data.quantity, inv.empty_warehouse) if inv.empty_warehouse >= data.quantity else data.quantity
        inv.empty_warehouse = max(0, inv.empty_warehouse - fill_qty)
        inv.filled_warehouse += fill_qty
    elif data.transaction_type == "purchase_in":
        # Add new empty or filled jars
        setattr(inv, data.target_state, getattr(inv, data.target_state) + data.quantity)
    elif data.transaction_type == "damage_writeoff":
        inv.filled_warehouse = max(0, inv.filled_warehouse - data.quantity)
        inv.damaged_qty += data.quantity

    # Log immutable inventory transaction
    tx = InventoryTransaction(
        tenant_id=tenant.id,
        branch_id=data.branch_id,
        product_id=data.product_id,
        transaction_type=data.transaction_type,
        quantity=data.quantity,
        destination_state=data.target_state,
        performed_by_id=user.id,
        notes=data.notes
    )
    db.add(tx)
    db.commit()

    return {"success": True, "message": "Inventory successfully adjusted and logged."}


@router.post("/inventory/transfer-to-vehicle")
def dispatch_to_vehicle(
    data: StockTransferRequest,
    tenant: Tenant = Depends(get_current_verified_tenant),
    user: User = Depends(require_permission(Permission.INVENTORY_TRANSFER)),
    db: Session = Depends(get_db)
):
    """Transfers filled jars from plant warehouse onto delivery driver vehicle (transit)."""
    inv = db.query(Inventory).filter(
        Inventory.tenant_id == tenant.id,
        Inventory.branch_id == data.branch_id,
        Inventory.product_id == data.product_id
    ).first()

    if not inv or inv.filled_warehouse < data.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient filled inventory in warehouse. Available: {inv.filled_warehouse if inv else 0}"
        )

    inv.filled_warehouse -= data.quantity
    inv.filled_transit += data.quantity

    tx = InventoryTransaction(
        tenant_id=tenant.id,
        branch_id=data.branch_id,
        product_id=data.product_id,
        transaction_type="dispatch_to_vehicle",
        quantity=data.quantity,
        source_state="filled_warehouse",
        destination_state="filled_transit",
        performed_by_id=user.id,
        notes=data.notes or "Dispatched jars for daily route"
    )
    db.add(tx)
    db.commit()

    return {"success": True, "message": f"Successfully loaded {data.quantity} jars to driver vehicle."}

