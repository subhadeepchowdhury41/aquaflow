#!/usr/bin/env python3
"""Comprehensive verification of the new Order -> Multi-Shipment -> Per-Order Invoice -> Universal Payments & Driver Privacy flow."""

import sys
import requests
from datetime import date, timedelta

BASE = "http://72.61.233.177:8010/api/v1"


def main():
    # 1. Authenticate Owner, Driver 1, Driver 2, Consumer
    owner_token = requests.post(
        f"{BASE}/auth/login",
        json={"email_or_phone": "owner@aquapure.com", "password": "Password@123"},
        timeout=15,
    ).json()["access_token"]
    owner_h = {"Authorization": f"Bearer {owner_token}"}

    requests.post(f"{BASE}/auth/otp/send", json={"phone": "9876543210"}, timeout=15)
    consumer_token = requests.post(
        f"{BASE}/auth/otp/verify", json={"phone": "9876543210", "otp": "123456"}, timeout=15
    ).json()["access_token"]
    consumer_h = {"Authorization": f"Bearer {consumer_token}"}

    driver1_token = requests.post(
        f"{BASE}/auth/login",
        json={"email_or_phone": "driver1@aquapure.com", "password": "Password@123"},
        timeout=15,
    ).json()["access_token"]
    driver1_h = {"Authorization": f"Bearer {driver1_token}"}

    drivers = requests.get(f"{BASE}/deliveries/available-drivers", headers=owner_h, timeout=15).json()
    assert len(drivers) >= 1, f"Expected at least 1 driver, got {drivers}"
    drv1_id = drivers[0]["id"]
    drv2_id = drivers[1]["id"] if len(drivers) > 1 else drivers[0]["id"]

    # 2. Customer creates an order request with partial payment while ordering -> must start in 'requested' status
    target_date = (date.today() + timedelta(days=2)).isoformat()
    req_resp = requests.post(
        f"{BASE}/portal/order-extra",
        headers=consumer_h,
        json={
            "quantity": 5,
            "delivery_date": target_date,
            "shift": "morning",
            "notes": "E2E test multi-shipment order",
            "pay_now_amount": 50.0,
            "payment_method": "upi",
        },
        timeout=15,
    )
    assert req_resp.status_code == 200, f"Order request failed: {req_resp.text}"
    req_data = req_resp.json()
    assert req_data["status"] == "requested", f"Expected 'requested', got {req_data}"
    order1_id = req_data["task_id"]
    print(f"[PASS] 1. Customer created order {req_data['order_number']} in status='requested'")

    # 3. Customer creates a second request which owner rejects
    req2 = requests.post(
        f"{BASE}/portal/order-extra",
        headers=consumer_h,
        json={"quantity": 2, "delivery_date": target_date, "shift": "evening", "notes": "Reject test"},
        timeout=15,
    ).json()
    rej_resp = requests.post(
        f"{BASE}/deliveries/{req2['task_id']}/reject",
        headers=owner_h,
        json={"reason": "Evening route full"},
        timeout=15,
    )
    assert rej_resp.status_code == 200 and rej_resp.json()["status"] == "rejected", rej_resp.text
    print(f"[PASS] 2. Owner rejected order {req2['order_number']} -> status='rejected'")

    # 4. Owner assigns two shipments to Order 1 (3 jars -> drv1 with ₹100 collect, 2 jars -> drv2 with ₹50 collect)
    s1_resp = requests.post(
        f"{BASE}/deliveries/{order1_id}/shipments",
        headers=owner_h,
        json={"driver_id": drv1_id, "assigned_qty": 3, "amount_to_collect": 100.0, "notes": "Morning trip 1"},
        timeout=15,
    )
    assert s1_resp.status_code == 200, f"Assign shipment 1 failed: {s1_resp.text}"
    s1 = s1_resp.json()

    s2_resp = requests.post(
        f"{BASE}/deliveries/{order1_id}/shipments",
        headers=owner_h,
        json={"driver_id": drv2_id, "assigned_qty": 2, "amount_to_collect": 50.0, "notes": "Morning trip 2"},
        timeout=15,
    )
    assert s2_resp.status_code == 200, f"Assign shipment 2 failed: {s2_resp.text}"
    s2 = s2_resp.json()

    # Verify order now has invoice, assigned status, 2 shipments, and remaining_assignable_qty == 0
    ord1 = requests.get(f"{BASE}/deliveries/orders/{order1_id}", headers=owner_h, timeout=15).json()
    assert ord1["status"] == "assigned", ord1
    assert ord1["invoice_number"], "Expected auto-generated invoice_number"
    assert len(ord1["shipments"]) == 2, ord1["shipments"]
    assert ord1["remaining_assignable_qty"] == 0, ord1
    print(f"[PASS] 3. Owner split order into 2 shipments ({s1['shipment_number']}, {s2['shipment_number']}) and generated invoice {ord1['invoice_number']}")

    # 5. Driver fetches active shipments and verifies privacy (NO product_price/unit_price/customer_balance; YES customer_jar_balance & amount_to_collect)
    drv_shps = requests.get(f"{BASE}/deliveries/driver/shipments", headers=driver1_h, timeout=15).json()
    matching = [x for x in drv_shps if x["id"] == s1["id"]]
    assert len(matching) == 1, f"Expected shipment {s1['id']} in driver shipments, got {drv_shps}"
    d_shp = matching[0]
    assert "product_price" not in d_shp and "unit_price" not in d_shp and "customer_balance" not in d_shp, (
        f"Driver payload leaked price or dues: {d_shp}"
    )
    assert "customer_jar_balance" in d_shp and d_shp["amount_to_collect"] == 100.0 and d_shp["assigned_qty"] == 3, d_shp
    print("[PASS] 4. Driver shipment endpoint hides jar rate & customer dues, shows customer_jar_balance & amount_to_collect")

    # 6. Complete Shipment 1 (Driver 1) -> order becomes partially_completed
    comp1 = requests.post(
        f"{BASE}/deliveries/shipments/{s1['id']}/complete",
        headers=driver1_h,
        json={
            "delivered_qty": 3,
            "empty_collected_qty": 2,
            "cash_collected": 100.0,
            "payment_mode": "cash",
            "delivery_status": "delivered",
            "notes": "Delivered 3 jars, got ₹100",
        },
        timeout=15,
    )
    assert comp1.status_code == 200, comp1.text
    ord1_mid = requests.get(f"{BASE}/deliveries/orders/{order1_id}", headers=owner_h, timeout=15).json()
    assert ord1_mid["status"] == "partially_completed", f"Expected partially_completed, got {ord1_mid['status']}"
    assert ord1_mid["delivered_qty_total"] == 3

    # Complete Shipment 2 -> order becomes completed
    comp2 = requests.post(
        f"{BASE}/deliveries/shipments/{s2['id']}/complete",
        headers=owner_h,
        json={
            "delivered_qty": 2,
            "empty_collected_qty": 2,
            "cash_collected": 50.0,
            "payment_mode": "upi",
            "delivery_status": "delivered",
            "notes": "Delivered remaining 2 jars",
        },
        timeout=15,
    )
    assert comp2.status_code == 200, comp2.text
    ord1_done = requests.get(f"{BASE}/deliveries/orders/{order1_id}", headers=owner_h, timeout=15).json()
    assert ord1_done["status"] == "completed", f"Expected completed, got {ord1_done['status']}"
    assert ord1_done["delivered_qty_total"] == 5
    stages = {p["payment_stage"] for p in ord1_done["payments"]}
    assert "while_order" in stages and "while_delivery" in stages, f"Expected both stages in order payments: {ord1_done['payments']}"
    print(f"[PASS] 5. Shipments rolled up order status (partially_completed -> completed); paid=₹{ord1_done['paid_amount']}, unpaid=₹{ord1_done['unpaid_amount']}")

    # 7. Owner creates an order directly with upfront payment + initial shipment, then pays remaining balance 'later'
    customers = requests.get(f"{BASE}/customers", headers=owner_h, timeout=15).json()
    products = requests.get(f"{BASE}/products", headers=owner_h, timeout=15).json()
    create_resp = requests.post(
        f"{BASE}/deliveries/orders",
        headers=owner_h,
        json={
            "customer_id": customers[0]["id"],
            "product_id": products[0]["id"],
            "expected_qty": 4,
            "scheduled_date": target_date,
            "shift": "afternoon",
            "notes": "Owner created direct order",
            "initial_payment_amount": 60.0,
            "initial_payment_method": "cash",
            "shipments": [{"driver_id": drv1_id, "assigned_qty": 4, "amount_to_collect": 0.0}],
        },
        timeout=15,
    )
    assert create_resp.status_code == 200, create_resp.text
    own_ord = create_resp.json()
    assert own_ord["invoice_number"] and own_ord["paid_amount"] == 60.0 and own_ord["unpaid_amount"] > 0

    if own_ord["unpaid_amount"] > 0:
        pay_later = requests.post(
            f"{BASE}/invoices/payments",
            headers=owner_h,
            json={
                "customer_id": customers[0]["id"],
                "order_id": own_ord["id"],
                "invoice_id": own_ord["invoice_id"],
                "payment_stage": "later",
                "amount": own_ord["unpaid_amount"],
                "payment_method": "upi",
                "notes": "Final balance settled later",
            },
            timeout=15,
        )
        assert pay_later.status_code == 200, pay_later.text

    own_ord_settled = requests.get(f"{BASE}/deliveries/orders/{own_ord['id']}", headers=owner_h, timeout=15).json()
    assert own_ord_settled["unpaid_amount"] == 0.0, own_ord_settled
    print(f"[PASS] 6. Owner created order {own_ord['order_number']} -> invoice {own_ord['invoice_number']} -> settled unpaid balance to ₹0.00")

    # 8. Universal Payments endpoint: filtering & pagination & order link
    univ = requests.get(
        f"{BASE}/invoices/payments/universal?page=1&page_size=10&payment_stage=while_delivery",
        headers=owner_h,
        timeout=15,
    )
    assert univ.status_code == 200, univ.text
    univ_data = univ.json()
    assert univ_data["total"] >= 1 and len(univ_data["items"]) >= 1
    assert any(it["order_id"] == order1_id for it in univ_data["items"]), "Expected Order 1 payment in universal payments"
    print(f"[PASS] 7. Universal payments returned {univ_data['total']} filtered rows with linked order_id metadata")

    print("\nALL NEW ORDER -> SHIPMENT -> PAYMENT FLOW TESTS PASSED!")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"FAILED: {exc}")
        sys.exit(1)
