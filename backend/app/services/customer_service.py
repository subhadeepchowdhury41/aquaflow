import uuid
import secrets
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy.orm import Session
from app.models.customer import Customer, CustomerGroup, CustomerProductPrice
from app.models.finance import CustomerLedger
from app.schemas.customer import CustomerCreate, CustomerUpdate, CustomerCustomPriceSet


class CustomerService:
    @staticmethod
    def create_customer(db: Session, tenant_id: uuid.UUID, data: CustomerCreate) -> Customer:
        """Registers a new customer, issues unique QR token, and registers opening balance."""
        # Generate sequential customer code if not provided
        if not data.customer_code:
            count = db.query(Customer).filter(Customer.tenant_id == tenant_id).count()
            customer_code = f"CUST-{(count + 1):04d}"
        else:
            customer_code = data.customer_code

        # Generate unique QR access token
        qr_token = f"AQ-CUST-{secrets.token_urlsafe(16)}"

        customer = Customer(
            tenant_id=tenant_id,
            customer_code=customer_code,
            name=data.name,
            phone=data.phone,
            alternate_phone=data.alternate_phone,
            email=data.email,
            address=data.address,
            latitude=data.latitude,
            longitude=data.longitude,
            category=data.category,
            billing_cycle=data.billing_cycle,
            branch_id=data.branch_id,
            group_id=data.group_id,
            route_id=data.route_id,
            assigned_driver_id=data.assigned_driver_id,
            credit_limit=data.credit_limit,
            jar_holding_limit=data.jar_holding_limit,
            opening_balance=data.opening_balance,
            current_balance=data.opening_balance,
            jar_balance=0,
            gstin=data.gstin,
            delivery_instructions=data.delivery_instructions,
            qr_code_token=qr_token,
            is_active=data.is_active
        )
        db.add(customer)
        db.flush()

        # If opening balance exists, write initial transaction to immutable customer ledger
        if data.opening_balance != 0:
            ledger_entry = CustomerLedger(
                tenant_id=tenant_id,
                customer_id=customer.id,
                transaction_date=datetime.now(timezone.utc),
                transaction_type="opening_balance",
                debit_amount=data.opening_balance if data.opening_balance > 0 else 0.0,
                credit_amount=abs(data.opening_balance) if data.opening_balance < 0 else 0.0,
                running_balance=data.opening_balance,
                reference_type="initialization",
                notes="Initial customer account opening balance"
            )
            db.add(ledger_entry)

        db.commit()
        db.refresh(customer)
        return customer

    @staticmethod
    def update_customer(db: Session, tenant_id: uuid.UUID, customer_id: uuid.UUID, data: CustomerUpdate) -> Customer:
        customer = db.query(Customer).filter(
            Customer.id == customer_id,
            Customer.tenant_id == tenant_id
        ).first()
        if not customer:
            raise ValueError("Customer not found")

        update_dict = data.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(customer, field, value)

        db.commit()
        db.refresh(customer)
        return customer

    @staticmethod
    def set_custom_price(db: Session, tenant_id: uuid.UUID, customer_id: uuid.UUID, data: CustomerCustomPriceSet) -> CustomerProductPrice:
        existing = db.query(CustomerProductPrice).filter(
            CustomerProductPrice.tenant_id == tenant_id,
            CustomerProductPrice.customer_id == customer_id,
            CustomerProductPrice.product_id == data.product_id
        ).first()

        if existing:
            existing.custom_price = data.custom_price
            if data.custom_deposit is not None:
                existing.custom_deposit = data.custom_deposit
            price_rec = existing
        else:
            price_rec = CustomerProductPrice(
                tenant_id=tenant_id,
                customer_id=customer_id,
                product_id=data.product_id,
                custom_price=data.custom_price,
                custom_deposit=data.custom_deposit
            )
            db.add(price_rec)

        db.commit()
        db.refresh(price_rec)
        return price_rec

