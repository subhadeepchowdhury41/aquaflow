from datetime import date
from app.models.product import Product, Inventory
from app.models.customer import Customer
from app.models.finance import CustomerLedger


def test_delivery_and_jar_inventory_workflow(client, db_session):
    # 1. Onboard a fresh tenant
    res = client.post(
        "/api/v1/onboarding/register",
        json={
            "business_name": "Ganga Pure Water Agency",
            "owner_name": "Vikram Singh",
            "email": "vikram@gangapure.com",
            "phone": "9876543299",
            "password": "Password@123",
            "address": "Ghat Road 12",
            "plan_slug": "starter"
        }
    )
    assert res.status_code == 200
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Get default branch and products
    branches = client.get("/api/v1/admin/branches", headers=headers).json()
    branch_id = branches[0]["id"]

    products = client.get("/api/v1/products", headers=headers).json()
    jar_product = next(p for p in products if p["sku"] == "JAR-20L")
    jar_id = jar_product["id"]

    # 3. Create a customer
    cust_res = client.post(
        "/api/v1/customers",
        headers=headers,
        json={
            "name": "Sunview Heights Apartment",
            "phone": "9991112233",
            "address": "Flat 402, Sunview",
            "branch_id": branch_id,
            "opening_balance": 0.0,
            "credit_limit": 2000.0,
            "jar_holding_limit": 10
        }
    )
    assert cust_res.status_code == 200
    cust_id = cust_res.json()["id"]

    # 4. Create a daily subscription for 2 jars every morning
    sub_res = client.post(
        "/api/v1/deliveries/subscriptions",
        headers=headers,
        json={
            "customer_id": cust_id,
            "product_id": jar_id,
            "branch_id": branch_id,
            "quantity": 2,
            "schedule_type": "daily",
            "shift": "morning",
            "unit_price": 40.0
        }
    )
    assert sub_res.status_code == 200
    sub_id = sub_res.json()["id"]

    # 5. Dispatch jars to driver vehicle (transfer from warehouse to transit)
    dispatch_res = client.post(
        "/api/v1/products/inventory/transfer-to-vehicle",
        headers=headers,
        json={
            "branch_id": branch_id,
            "product_id": jar_id,
            "quantity": 10,
            "source_state": "filled_warehouse",
            "destination_state": "filled_transit",
            "notes": "Morning vehicle load"
        }
    )
    assert dispatch_res.status_code == 200

    # 6. Generate delivery tasks for today
    today_str = date.today().isoformat()
    gen_res = client.post(f"/api/v1/deliveries/generate?target_date={today_str}", headers=headers)
    assert gen_res.status_code == 200
    assert gen_res.json()["new_tasks_generated"] >= 1

    # Idempotency test: calling generate again on the same day must generate 0 new duplicates
    gen_again = client.post(f"/api/v1/deliveries/generate?target_date={today_str}", headers=headers)
    assert gen_again.status_code == 200
    assert gen_again.json()["new_tasks_generated"] == 0

    # 7. Get today's delivery tasks
    tasks = client.get("/api/v1/deliveries/today", headers=headers).json()
    assert len(tasks) >= 1
    task = next(t for t in tasks if t["customer_id"] == cust_id)
    assert task["expected_qty"] == 2
    assert task["status"] == "pending"

    # 8. Record delivery stop:
    # Delivered 2 jars, collected 1 empty jar, collected ₹80 cash
    rec_res = client.post(
        "/api/v1/deliveries/record",
        headers=headers,
        json={
            "delivery_task_id": task["id"],
            "delivered_qty": 2,
            "empty_collected_qty": 1,
            "cash_collected": 80.0,
            "payment_mode": "cash",
            "delivery_status": "delivered",
            "notes": "Delivered to security gate"
        }
    )
    if rec_res.status_code != 200:
        print("ERROR RESPONSE:", rec_res.json())
    assert rec_res.status_code == 200
    assert rec_res.json()["status"] == "delivered"

    # 9. Verify Customer state:
    # Jar balance: net +1 jar held (2 delivered - 1 collected)
    # Financial balance: 2 jars @ 40 = +80 debit, -80 cash payment credit = 0 balance
    cust_updated = client.get(f"/api/v1/customers/{cust_id}", headers=headers).json()
    assert cust_updated["jar_balance"] == 1
    assert cust_updated["current_balance"] == 0.0

    # 10. Verify Immutable Ledger entries:
    ledger = client.get(f"/api/v1/customers/{cust_id}/ledger", headers=headers).json()
    assert len(ledger) >= 2  # 1 delivery debit charge, 1 cash payment credit
    types = [l["transaction_type"] for l in ledger]
    assert "delivery_charge" in types
    assert "payment_received" in types
