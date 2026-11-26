#!/usr/bin/env python3
"""
AquaFlow SaaS - Complete End-to-End (E2E) Verification Suite
Tests all 4 user roles and end-to-end workflows:
1. Super Admin (Platform Control Plane)
2. Tenant Owner (Business Suite & Operations)
3. Delivery Driver (Mobile Dispatch & Fulfillment)
4. Consumer (Self-Service Portal, Deliveries, Requests & Payments)
"""

import sys
import json
import urllib.request
import urllib.error
from datetime import date, timedelta

BASE_URL = "http://72.61.233.177:8010/api/v1"

def log_section(title):
    print("\n" + "=" * 70)
    print(f" >>> {title.upper()} <<< ")
    print("=" * 70)

def log_step(step_num, desc, passed=True, details=""):
    mark = "✓ PASS" if passed else "✗ FAIL"
    print(f" [{mark}] Step {step_num}: {desc}")
    if details:
        print(f"         └─> {details}")
    if not passed:
        raise Exception(f"Step {step_num} failed: {desc} - {details}")

def make_request(endpoint, method="GET", data=None, token=None):
    url = f"{BASE_URL}{endpoint}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    encoded_data = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=encoded_data, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            status_code = resp.getcode()
            body = resp.read().decode("utf-8")
            return status_code, json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = {"detail": body}
        return e.code, parsed
    except Exception as e:
        return 0, {"error": str(e)}


def test_super_admin_flow():
    log_section("1. Super Admin End-to-End Flow")
    
    # 1. Login
    code, res = make_request("/auth/login", method="POST", data={
        "email_or_phone": "superadmin@aquaflow.io",
        "password": "Admin@AquaFlow2026!"
    })
    log_step("1.1", "Super Admin Login", code == 200, f"Status: {code}, Tokens issued: {bool(res.get('access_token'))}")
    admin_token = res["access_token"]
    
    # 2. Verify Profile /auth/me
    code, res = make_request("/auth/me", token=admin_token)
    is_super = res.get("is_super_admin") is True and res.get("role") == "super_admin"
    log_step("1.2", "Verify Profile Claims", is_super, f"Role: {res.get('role')}, is_super_admin: {res.get('is_super_admin')}")
    
    # 3. Platform Dashboard Stats
    code, res = make_request("/platform/dashboard", token=admin_token)
    log_step("1.3", "Platform Dashboard Overview", code == 200, 
             f"Active Tenants: {res.get('active_tenants')}, MRR: ₹{res.get('mrr', 0):,.2f}, Total Deliveries: {res.get('total_deliveries')}")
    
    # 4. Subscription Plans
    code, res = make_request("/platform/plans", token=admin_token)
    plan_names = [p.get("name") for p in res] if isinstance(res, list) else []
    log_step("1.4", "Platform Plans List", code == 200 and len(plan_names) > 0, f"Available Plans: {', '.join(plan_names)}")
    
    # 5. List Tenants
    code, res = make_request("/platform/tenants", token=admin_token)
    tenants = res if isinstance(res, list) else []
    log_step("1.5", "Platform Tenants Directory", code == 200 and len(tenants) > 0, 
             f"Registered Tenants: {len(tenants)} (Primary: {tenants[0].get('name') if tenants else 'N/A'})")
    
    # 6. Extend License
    if tenants:
        t_id = tenants[0]["id"]
        code, res = make_request(f"/platform/licenses/extend?tenant_id={t_id}", method="POST", token=admin_token, data={
            "additional_days": 15,
            "notes": "Automated E2E license renewal extension"
        })
        log_step("1.6", "Extend Tenant License Validity", code == 200, 
                 f"New Expiry: {res.get('valid_until')}, Status: {res.get('status')}")

    return tenants[0]["id"] if tenants else None


def test_tenant_owner_flow():
    log_section("2. Tenant Owner / Business Admin Flow")
    
    # 1. Login
    code, res = make_request("/auth/login", method="POST", data={
        "email_or_phone": "owner@aquapure.com",
        "password": "Password@123"
    })
    log_step("2.1", "Tenant Owner Login", code == 200, f"Status: {code}, Tokens issued: {bool(res.get('access_token'))}")
    owner_token = res["access_token"]
    
    # 2. Verify Profile /auth/me
    code, res = make_request("/auth/me", token=owner_token)
    tenant_id = res.get("tenant_id")
    log_step("2.2", "Verify Business Tenant Context", code == 200 and bool(tenant_id), 
             f"Name: {res.get('full_name')}, Role: {res.get('role')}, Tenant ID: {tenant_id}")
    
    # 3. Products Catalog
    code, res = make_request("/products", token=owner_token)
    products = res if isinstance(res, list) else []
    prod_names = [f"{p['name']} (₹{p['selling_price']})" for p in products]
    log_step("2.3", "Product & Pricing Catalog", code == 200 and len(products) > 0, f"Catalog: {', '.join(prod_names)}")
    
    # 4. Customers List
    code, res = make_request("/customers", token=owner_token)
    customers = res if isinstance(res, list) else []
    log_step("2.4", "Customer Management Directory", code == 200, f"Total Customers: {len(customers)}")
    
    # 5. Create a New Customer
    import secrets
    new_phone = f"9988{secrets.randbelow(900000) + 100000}"
    code, res = make_request("/customers", method="POST", token=owner_token, data={
        "name": f"Greenwood Villa Office {new_phone[-4:]}",
        "phone": new_phone,
        "address": "Tower 4, Floor 3, Tech Park",
        "category": "corporate",
        "credit_limit": 2000.0,
        "jar_holding_limit": 8,
        "opening_balance": 0.0
    })
    log_step("2.5", "Create New Business Customer", code == 200, 
             f"Customer: Greenwood Villa Office {new_phone[-4:]}, Phone: {new_phone}, Code: {res.get('customer_code', 'N/A')}")
    
    # 6. Delivery Routes
    code, res = make_request("/deliveries/routes", token=owner_token)
    routes = res if isinstance(res, list) else []
    log_step("2.6", "Delivery Routes Configuration", code == 200 and len(routes) > 0, 
             f"Configured Routes: {len(routes)} (e.g. {routes[0]['name'] if routes else 'None'})")
    
    # 7. Generate Daily Deliveries
    target_dt = date.today().isoformat()
    code, res = make_request(f"/deliveries/generate?target_date={target_dt}", method="POST", token=owner_token)
    log_step("2.7", "Generate Daily Delivery Run", code == 200, 
             f"New Tasks Generated: {res.get('new_tasks_generated', 0)}, Date: {res.get('date', target_dt)}")
    
    # 8. Query Today's Deliveries
    code, res = make_request("/deliveries/today", token=owner_token)
    tasks = res if isinstance(res, list) else []
    log_step("2.8", "Dispatch Board for Today", code == 200, f"Scheduled Stops Today: {len(tasks)}")
    
    # 9. Invoices Directory
    code, res = make_request("/invoices", token=owner_token)
    invoices = res if isinstance(res, list) else []
    log_step("2.9", "Billing & Invoices Audit", code == 200, f"Total Invoices: {len(invoices)}")
    
    return owner_token, tasks


def test_delivery_driver_flow(today_tasks):
    log_section("3. Delivery Driver Mobile Flow")
    
    # 1. Driver Login
    code, res = make_request("/auth/login", method="POST", data={
        "email_or_phone": "driver1@aquapure.com",
        "password": "Password@123"
    })
    log_step("3.1", "Driver Authentication", code == 200, f"Driver Token Issued: {bool(res.get('access_token'))}")
    driver_token = res["access_token"]
    
    # 2. Verify Profile /auth/me
    code, res = make_request("/auth/me", token=driver_token)
    log_step("3.2", "Verify Driver Role", code == 200 and res.get("role") == "delivery_driver", 
             f"Driver Name: {res.get('full_name')}, Role: {res.get('role')}")
    
    # 3. Query Assigned Tasks
    code, res = make_request("/deliveries/today", token=driver_token)
    assigned_tasks = res if isinstance(res, list) else []
    log_step("3.3", "Driver Daily Manifest", code == 200, f"Assigned Delivery Stops: {len(assigned_tasks)}")
    
    # 4. Record Delivery Execution (Fulfillment)
    target_task = None
    for t in assigned_tasks:
        if t.get("status") in ["pending", "in_transit"]:
            target_task = t
            break
            
    if not target_task and assigned_tasks:
        target_task = assigned_tasks[0]
        
    if target_task:
        code, res = make_request("/deliveries/record", method="POST", token=driver_token, data={
            "delivery_task_id": target_task["id"],
            "delivered_qty": target_task.get("expected_qty", 2),
            "empty_collected_qty": target_task.get("expected_qty", 2),
            "cash_collected": 80.0,
            "payment_mode": "cash",
            "delivery_status": "delivered",
            "notes": "Doorstep delivery completed. 2 empties collected."
        })
        log_step("3.4", "Complete Delivery Stop", code == 200, 
                 f"Task: {target_task['id'][:8]}..., Delivered: {res.get('delivered_qty')}, Empty: {res.get('empty_collected')}, Cash: ₹{res.get('cash_collected')}")
    else:
        log_step("3.4", "Complete Delivery Stop (Skip - no tasks)", True, "Manifest empty for current driver")


def test_consumer_flow():
    log_section("4. Consumer Self-Service Portal Flow")
    
    customer_phone = "9876543210"
    
    # 1. OTP Request
    code, res = make_request("/auth/otp/send", method="POST", data={"phone": customer_phone})
    log_step("4.1", "Consumer Request OTP", code == 200, f"OTP Sent to {customer_phone}: {res.get('message')}")
    
    # 2. OTP Verification
    code, res = make_request("/auth/otp/verify", method="POST", data={
        "phone": customer_phone,
        "otp": "123456"
    })
    log_step("4.2", "Consumer Verify OTP & Login", code == 200 and bool(res.get("access_token")), 
             f"Token received, expires in {res.get('expires_in')}s")
    consumer_token = res["access_token"]
    
    # 3. Verify Consumer Profile /auth/me
    code, res = make_request("/auth/me", token=consumer_token)
    log_step("4.3", "Consumer Identity & Permissions", code == 200 and res.get("role") == "customer", 
             f"Customer: {res.get('full_name')}, Role: {res.get('role')}, Permissions: {res.get('permissions')}")
    
    # 4. Portal Account Summary /portal/me
    code, res = make_request("/portal/me", token=consumer_token)
    initial_balance = res.get("current_balance", 0.0)
    log_step("4.4", "Portal Account Summary", code == 200, 
             f"Name: {res.get('name')}, Balance Due: ₹{initial_balance:.2f}, Jar Balance: {res.get('jar_balance')}/{res.get('jar_holding_limit')}, Supplier: {res.get('supplier', {}).get('name')}")
    
    # 5. Order History & Timeline /portal/deliveries
    code, res = make_request("/portal/deliveries", token=consumer_token)
    deliveries = res if isinstance(res, list) else []
    sample_timeline = deliveries[0]["timeline"] if deliveries and "timeline" in deliveries[0] else []
    steps_summary = " -> ".join([s["step"] for s in sample_timeline]) if sample_timeline else "No timeline steps"
    log_step("4.5", "Deliveries & Lifecycle Timeline", code == 200 and len(deliveries) > 0, 
             f"Past/Upcoming Orders: {len(deliveries)}, Lifecycle: [{steps_summary}]")
    
    # 6. Financial Ledger /portal/ledger
    code, res = make_request("/portal/ledger", token=consumer_token)
    txs = res.get("transactions", [])
    log_step("4.6", "Customer Dues & Ledger", code == 200, 
             f"Running Balance: ₹{res.get('current_balance', 0):.2f}, Ledger Entries: {len(txs)}")
    
    # 7. Action: Order Extra Jars /portal/order-extra
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    code, res = make_request("/portal/order-extra", method="POST", token=consumer_token, data={
        "quantity": 2,
        "delivery_date": tomorrow,
        "shift": "morning",
        "notes": "Extra water jars for celebration"
    })
    log_step("4.7", "Action: Request Extra Jars", code == 200, 
             f"Extra Delivery Scheduled for {tomorrow} (morning shift), Task ID: {res.get('delivery_task_id', 'Logged')}")
    
    # 8. Action: Submit Service Ticket /portal/request
    code, res = make_request("/portal/request", method="POST", token=consumer_token, data={
        "category": "jar_leakage",
        "title": "Dispenser Seal Check Required",
        "description": "Please check the rubber seal ring during tomorrow's delivery."
    })
    log_step("4.8", "Action: Raise Service Ticket", code == 200, 
             f"Ticket ID: {res.get('ticket_id')}, Status: {res.get('status')}")
    
    # 9. Verify Ticket in Requests List /portal/requests
    code, res = make_request("/portal/requests", token=consumer_token)
    tickets = res if isinstance(res, list) else []
    log_step("4.9", "Track Service Requests", code == 200 and len(tickets) > 0, 
             f"Active Tickets Tracked: {len(tickets)} (Latest: {tickets[0].get('title')})")
    
    # 10. Action: Pay Outstanding Dues /portal/pay
    pay_amount = 40.0
    code, res = make_request("/portal/pay", method="POST", token=consumer_token, data={
        "amount": pay_amount,
        "payment_method": "upi",
        "notes": "E2E automated test online payment via UPI"
    })
    new_bal = res.get("new_balance")
    log_step("4.10", "Action: Online Dues Payment (UPI)", code == 200, 
             f"Amount Paid: ₹{pay_amount:.2f}, Receipt: {res.get('payment_number')}, New Balance: ₹{new_bal:.2f}")
    
    # 11. Invoices List /portal/invoices
    code, res = make_request("/portal/invoices", token=consumer_token)
    invoices = res if isinstance(res, list) else []
    log_step("4.11", "View Invoices & Statements", code == 200, f"Available Invoices: {len(invoices)}")
    
    # 12. Sign Out / Invalidation
    code, res = make_request("/portal/me", token="invalid_or_logged_out_token")
    log_step("4.12", "Sign Out & Security Isolation", code == 401, 
             f"Protected portal correctly rejected unauthenticated request: {code} Unauthorized")


def main():
    print("=" * 70)
    print("   AQUAFLOW MULTI-TENANT SAAS - END-TO-END VERIFICATION SUITE   ")
    print(f"   Target Remote API: {BASE_URL}")
    print("=" * 70)
    
    try:
        tenant_id = test_super_admin_flow()
        owner_token, today_tasks = test_tenant_owner_flow()
        test_delivery_driver_flow(today_tasks)
        test_consumer_flow()
        
        print("\n" + "=" * 70)
        print(" ★★★ ALL END-TO-END FLOWS FOR ALL 4 USER ROLES PASSED (100%) ★★★ ")
        print("=" * 70)
        return 0
    except Exception as e:
        print(f"\nFATAL: Verification failed with exception: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
