import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from datetime import date, datetime, timezone, timedelta
from app.core.database import SessionLocal, Base, engine
from app.models import *
from app.services.platform_service import PlatformService
from app.services.delivery_service import DeliveryService
from app.schemas.platform import TenantCreate
from app.schemas.customer import CustomerCreate
from app.services.customer_service import CustomerService


def seed():
    print("Initializing Database tables...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        print("Seeding Platform Super Admin & Plans...")
        PlatformService.seed_initial_platform_data(db)

        # 1. Create Main Showcase Tenant: AquaPure Water
        existing = db.query(Tenant).filter(Tenant.email == "owner@aquapure.com").first()
        if not existing:
            print("Creating Showcase Tenant: AquaPure Water Systems...")
            tenant_data = TenantCreate(
                name="AquaPure Water Systems",
                slug="aquapure",
                owner_name="Rajesh Sharma",
                email="owner@aquapure.com",
                phone="9876500001",
                address="Plot 45, Okhla Phase 3, Industrial Area, New Delhi",
                gstin="07AAAAA0000A1Z5",
                business_category="water_jars",
                initial_password="Password@123"
            )
            tenant = PlatformService.create_tenant(db, tenant_data)
            branch = db.query(Branch).filter(Branch.tenant_id == tenant.id).first()

            # Create second branch
            branch2 = Branch(
                tenant_id=tenant.id,
                name="AquaPure - South Ext Depot",
                code="DEPOT-02",
                address="Sector 7, South Ext, New Delhi",
                phone="9876500002",
                email="southext@aquapure.com",
                is_headquarters=False,
                is_active=True
            )
            db.add(branch2)
            db.flush()

            # Create Delivery Drivers
            driver1 = User(
                tenant_id=tenant.id,
                email="driver1@aquapure.com",
                phone="9876500011",
                hashed_password=tenant.users[0].hashed_password,
                full_name="Ramesh Kumar (Driver)",
                role="delivery_driver",
                branch_id=branch.id,
                is_active=True
            )
            driver2 = User(
                tenant_id=tenant.id,
                email="driver2@aquapure.com",
                phone="9876500012",
                hashed_password=tenant.users[0].hashed_password,
                full_name="Sunil Verma (Driver)",
                role="delivery_driver",
                branch_id=branch2.id,
                is_active=True
            )
            db.add_all([driver1, driver2])
            db.flush()

            # Create Routes
            route1 = DeliveryRoute(
                tenant_id=tenant.id,
                branch_id=branch.id,
                name="Route A - Okhla & Nehru Place",
                description="Commercial offices & residential towers",
                default_driver_id=driver1.id,
                is_active=True
            )
            route2 = DeliveryRoute(
                tenant_id=tenant.id,
                branch_id=branch2.id,
                name="Route B - Greater Kailash & Saket",
                description="Residential societies & clinics",
                default_driver_id=driver2.id,
                is_active=True
            )
            db.add_all([route1, route2])
            db.flush()

            # Create Customers
            customers_seed = [
                {"name": "Apex Corporate Towers", "phone": "9811122201", "address": "Tower B, 4th Floor, Okhla", "cat": "corporate", "bal": 450.0, "jars": 15, "limit": 20, "r": route1, "d": driver1},
                {"name": "Greenwood Heights Society", "phone": "9811122202", "address": "Block C, Nehru Place", "cat": "residential", "bal": 120.0, "jars": 4, "limit": 6, "r": route1, "d": driver1},
                {"name": "CareWell Diagnostic Clinic", "phone": "9811122203", "address": "Main Market, GK-1", "cat": "commercial", "bal": 0.0, "jars": 2, "limit": 4, "r": route2, "d": driver2},
                {"name": "Metro Co-Working Hub", "phone": "9811122204", "address": "Plot 12, Saket District Centre", "cat": "corporate", "bal": 800.0, "jars": 10, "limit": 15, "r": route2, "d": driver2},
                {"name": "Dr. Ananya Roy Clinic", "phone": "9811122205", "address": "M-Block, GK-2", "cat": "commercial", "bal": 0.0, "jars": 2, "limit": 4, "r": route2, "d": driver2},
                {"name": "Sharma Residence", "phone": "9876543210", "address": "House 45, Alaknanda", "cat": "residential", "bal": 80.0, "jars": 2, "limit": 4, "r": route1, "d": driver1}
            ]

            jar_prod = db.query(Product).filter(Product.tenant_id == tenant.id, Product.sku == "JAR-20L").first()

            for c_info in customers_seed:
                c_data = CustomerCreate(
                    name=c_info["name"],
                    phone=c_info["phone"],
                    address=c_info["address"],
                    category=c_info["cat"],
                    opening_balance=c_info["bal"],
                    jar_holding_limit=c_info["limit"],
                    branch_id=c_info["r"].branch_id,
                    route_id=c_info["r"].id,
                    assigned_driver_id=c_info["d"].id
                )
                cust = CustomerService.create_customer(db, tenant.id, c_data)
                cust.jar_balance = c_info["jars"]

                # Create recurring subscription for 20L jars
                sub = Subscription(
                    tenant_id=tenant.id,
                    customer_id=cust.id,
                    product_id=jar_prod.id,
                    branch_id=cust.branch_id,
                    route_id=cust.route_id,
                    driver_id=cust.assigned_driver_id,
                    quantity=3 if c_info["cat"] == "corporate" else 1,
                    schedule_type="daily",
                    shift="morning",
                    unit_price=40.0,
                    status="active"
                )
                db.add(sub)

            db.commit()

            # Generate today's deliveries
            print("Generating today's delivery tasks...")
            DeliveryService.generate_daily_delivery_tasks(db, tenant.id, date.today())
            print("Seeding completed successfully!")
        else:
            print("Showcase tenant already exists, skipping.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()

