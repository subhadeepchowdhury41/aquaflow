from datetime import date
from app.models.customer import Customer
from app.models.finance import Invoice, Payment, CustomerLedger


def test_billing_and_payment_reconciliation(client, db_session):
    # 1. Onboard a fresh tenant
    res = client.post(
        "/api/v1/onboarding/register",
        json={
            "business_name": "Royal Aqua Mineral Water",
            "owner_name": "Suresh Patel",
            "email": "suresh@royalaqua.com",
            "phone": "9876543288",
            "password": "Password@123",
            "address": "Ring Road Sector 4",
            "plan_slug": "starter"
        }
    )
    assert res.status_code == 200
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Create customer
    cust_res = client.post(
        "/api/v1/customers",
        headers=headers,
        json={
            "name": "Grand Palace Hotel",
            "phone": "9822334455",
            "address": "MG Road",
            "opening_balance": 1000.0,
            "credit_limit": 10000.0
        }
    )
    assert cust_res.status_code == 200
    cust_id = cust_res.json()["id"]

    # Opening balance verification
    cust = client.get(f"/api/v1/customers/{cust_id}", headers=headers).json()
    assert cust["current_balance"] == 1000.0

    # 3. Customer makes an official payment of ₹600 via UPI
    pay_res = client.post(
        "/api/v1/invoices/payments",
        headers=headers,
        json={
            "customer_id": cust_id,
            "amount": 600.0,
            "payment_method": "upi",
            "payment_ref_id": "UPI-TXN-99887766",
            "notes": "Bank transfer via QR"
        }
    )
    assert pay_res.status_code == 200

    # 4. Check updated balance: 1000 - 600 = 400
    cust_after = client.get(f"/api/v1/customers/{cust_id}", headers=headers).json()
    assert cust_after["current_balance"] == 400.0

    # 5. Check ledger: must show opening balance (1000) and payment credit (600)
    ledger = client.get(f"/api/v1/customers/{cust_id}/ledger", headers=headers).json()
    assert len(ledger) == 2
    latest = ledger[0]
    assert latest["transaction_type"] == "payment_received"
    assert latest["credit_amount"] == 600.0
    assert latest["running_balance"] == 400.0

