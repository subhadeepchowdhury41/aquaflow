from datetime import datetime, timezone, timedelta
from app.core.config import settings
from app.core.license import LicenseStatus
from app.models.tenant import Tenant
from app.models.platform import TenantLicense


def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_super_admin_login(client):
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email_or_phone": settings.SUPER_ADMIN_EMAIL,
            "password": settings.SUPER_ADMIN_PASSWORD
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

    # Test super admin dashboard
    headers = {"Authorization": f"Bearer {data['access_token']}"}
    dash_res = client.get("/api/v1/platform/dashboard", headers=headers)
    assert dash_res.status_code == 200
    dash_data = dash_res.json()
    assert "total_tenants" in dash_data
    assert "mrr" in dash_data


def test_tenant_onboarding_and_isolation(client, db_session):
    # 1. Onboard Tenant 1: "Crystal Pure Water"
    res1 = client.post(
        "/api/v1/onboarding/register",
        json={
            "business_name": "Crystal Pure Water",
            "owner_name": "John Doe",
            "email": "john@crystalpure.com",
            "phone": "9876543211",
            "password": "Password@123",
            "address": "123 Industrial Area, Zone 1",
            "plan_slug": "starter"
        }
    )
    assert res1.status_code == 200
    token1 = res1.json()["access_token"]
    headers1 = {"Authorization": f"Bearer {token1}"}

    # 2. Onboard Tenant 2: "Blue Drop RO Water"
    res2 = client.post(
        "/api/v1/onboarding/register",
        json={
            "business_name": "Blue Drop RO Water",
            "owner_name": "Alice Smith",
            "email": "alice@bluedrop.com",
            "phone": "9876543212",
            "password": "Password@123",
            "address": "456 Commercial Hub, Zone 2",
            "plan_slug": "starter"
        }
    )
    assert res2.status_code == 200
    token2 = res2.json()["access_token"]
    headers2 = {"Authorization": f"Bearer {token2}"}

    # 3. Tenant 1 adds a customer
    cust_res1 = client.post(
        "/api/v1/customers",
        headers=headers1,
        json={
            "name": "Acme Corp Office",
            "phone": "9998887771",
            "address": "Suite 100, Tech Park",
            "opening_balance": 500.0,
            "credit_limit": 5000.0
        }
    )
    assert cust_res1.status_code == 200
    cust1_id = cust_res1.json()["id"]

    # 4. Strict Isolation Check: Tenant 2 listing customers must NOT see Tenant 1's customer
    t2_customers = client.get("/api/v1/customers", headers=headers2)
    assert t2_customers.status_code == 200
    t2_ids = [c["id"] for c in t2_customers.json()]
    assert cust1_id not in t2_ids

    # Tenant 2 attempting to directly GET Tenant 1's customer must return 404
    t2_direct_access = client.get(f"/api/v1/customers/{cust1_id}", headers=headers2)
    assert t2_direct_access.status_code == 404


def test_license_expiration_enforcement(client, db_session):
    # Register a tenant
    res = client.post(
        "/api/v1/onboarding/register",
        json={
            "business_name": "Himalayan Spring RO",
            "owner_name": "David Miller",
            "email": "david@himalayan.com",
            "phone": "9876543213",
            "password": "Password@123",
            "address": "Hill Road 5",
            "plan_slug": "starter"
        }
    )
    assert res.status_code == 200
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Check profile while active
    prof_res = client.get("/api/v1/admin/profile", headers=headers)
    assert prof_res.status_code == 200
    assert prof_res.json()["license"]["is_operational"] is True

    # Mutate license to EXPIRED (expiry date 30 days in past, exceeding grace period)
    tenant = db_session.query(Tenant).filter(Tenant.email == "david@himalayan.com").first()
    license = db_session.query(TenantLicense).filter(TenantLicense.tenant_id == tenant.id).first()
    license.expires_at = datetime.now(timezone.utc) - timedelta(days=30)
    license.status = LicenseStatus.EXPIRED.value
    db_session.commit()

    # Attempting business mutation (e.g., adding a customer) MUST be blocked with HTTP 402 Payment Required
    blocked_res = client.post(
        "/api/v1/customers",
        headers=headers,
        json={
            "name": "Blocked Customer Request",
            "phone": "9998887779",
            "address": "Nowhere"
        }
    )
    assert blocked_res.status_code == 402
    assert "LICENSE_EXPIRED" in str(blocked_res.json())

    # Renewal endpoint is permitted even when expired
    renew_res = client.post("/api/v1/admin/subscriptions/renew?validity_days=30", headers=headers)
    assert renew_res.status_code == 200
    assert renew_res.json()["success"] is True

    # Post-renewal: business mutation is unlocked
    allowed_res = client.post(
        "/api/v1/customers",
        headers=headers,
        json={
            "name": "Restored Customer",
            "phone": "9998887779",
            "address": "Nowhere"
        }
    )
    assert allowed_res.status_code == 200




def test_consumer_otp_login_and_portal_access(client, db_session):
    # 1. Onboard tenant
    res = client.post(
        "/api/v1/onboarding/register",
        json={
            "business_name": "Pure Alpine RO Water",
            "owner_name": "Rohan Verma",
            "email": "rohan@purealpine.com",
            "phone": "9876543300",
            "password": "Password@123",
            "address": "Mall Road 10",
            "plan_slug": "starter"
        }
    )
    assert res.status_code == 200
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Register Customer with phone 9876543210
    cust_res = client.post(
        "/api/v1/customers",
        headers=headers,
        json={
            "name": "Consumer Sharma",
            "phone": "9876543210",
            "address": "B-12, Green Park",
            "opening_balance": 150.0
        }
    )
    assert cust_res.status_code == 200

    # 3. Request OTP for 9876543210
    otp_req = client.post("/api/v1/auth/otp/send", json={"phone": "9876543210"})
    assert otp_req.status_code == 200

    # 4. Verify OTP (dev code 123456)
    verify_res = client.post("/api/v1/auth/otp/verify", json={"phone": "9876543210", "otp": "123456"})
    assert verify_res.status_code == 200
    cust_token = verify_res.json()["access_token"]
    cust_headers = {"Authorization": f"Bearer {cust_token}"}

    # 5. Access /auth/me with customer token
    me_res = client.get("/api/v1/auth/me", headers=cust_headers)
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["role"] == "customer"
    assert me_data["phone"] == "9876543210"
    assert me_data["full_name"] == "Consumer Sharma"

    # 6. Access customer portal /portal/me
    portal_res = client.get("/api/v1/portal/me", headers=cust_headers)
    assert portal_res.status_code == 200
    portal_data = portal_res.json()
    assert portal_data["name"] == "Consumer Sharma"
    assert portal_data["current_balance"] == 150.0
