import requests

BASE = 'http://72.61.233.177:8010/api/v1'

# 1. Login as owner
resp = requests.post(f'{BASE}/auth/login', json={'email_or_phone': 'owner@aquapure.com', 'password': 'Password@123'})
assert resp.status_code == 200, f'Owner login failed: {resp.text}'
owner_token = resp.json()['access_token']
headers = {'Authorization': f'Bearer {owner_token}'}

# 2. Check today's tasks
r_today = requests.get(f'{BASE}/deliveries/today', headers=headers)
assert r_today.status_code == 200, f'Today tasks failed: {r_today.text}'
today_tasks = r_today.json()
print(f'Today tasks count: {len(today_tasks)}')

# 3. Check tomorrow's tasks (2026-11-27)
r_tomorrow = requests.get(f'{BASE}/deliveries/today?target_date=2026-11-27', headers=headers)
assert r_tomorrow.status_code == 200, f'Tomorrow tasks failed: {r_tomorrow.text}'
tomorrow_tasks = r_tomorrow.json()
print(f'Tomorrow tasks count: {len(tomorrow_tasks)}')
sharma_tomorrow = [t for t in tomorrow_tasks if 'Sharma' in (t.get('customer_name') or '')]
if sharma_tomorrow:
    print(f'Sharma tomorrow task: {sharma_tomorrow[0]["expected_qty"]} Jars, scheduled_date: {sharma_tomorrow[0]["scheduled_date"]}, driver: {sharma_tomorrow[0]["driver_name"]}')

# 4. Check all dates tasks
r_all = requests.get(f'{BASE}/deliveries/today?all_dates=true', headers=headers)
assert r_all.status_code == 200, f'All dates failed: {r_all.text}'
print(f'All dates tasks count: {len(r_all.json())}')

# 5. Check available drivers
r_drivers = requests.get(f'{BASE}/deliveries/available-drivers', headers=headers)
assert r_drivers.status_code == 200, f'Available drivers failed: {r_drivers.text}'
drivers = r_drivers.json()
print(f'Available drivers count: {len(drivers)}, first: {drivers[0]}')

# 6. Check driver reassignment
if tomorrow_tasks and drivers:
    task_id = tomorrow_tasks[0]['id']
    driver_id = drivers[0]['id']
    r_reassign = requests.post(f'{BASE}/deliveries/{task_id}/reassign', headers=headers, json={'new_driver_id': driver_id})
    assert r_reassign.status_code == 200, f'Reassign failed: {r_reassign.text}'
    print('Reassign task success:', r_reassign.json()['message'])

# 7. Check customer payments & ledger
if today_tasks:
    cust_id = today_tasks[0]['customer_id']
    r_pay = requests.get(f'{BASE}/invoices/payments?customer_id={cust_id}', headers=headers)
    assert r_pay.status_code == 200, f'Payments failed: {r_pay.text}'
    print(f'Customer payments count: {len(r_pay.json())}')
    
    r_ledger = requests.get(f'{BASE}/customers/{cust_id}/ledger', headers=headers)
    assert r_ledger.status_code == 200, f'Ledger failed: {r_ledger.text}'
    print(f'Customer ledger count: {len(r_ledger.json())}')

print('ALL ENDPOINT VERIFICATIONS PASSED SUCCESSFULLY!')
