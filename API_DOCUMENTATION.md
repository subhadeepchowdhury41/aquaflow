# AquaFlow API Reference & Specification

## 1. Overview & General Standards
AquaFlow exposes a clean, RESTful JSON API generated via FastAPI and documented with OpenAPI 3.1.
- **Base URL Prefix**: `/api/v1`
- **Authentication**: Bearer JWT (`Authorization: Bearer <access_token>`)
- **Tenant Context**: Inferred from the JWT payload claims (`tenant_id`, `sub`, `roles`). Never supplied as a query parameter or body parameter for tenant isolation security.
- **Idempotency**: All mutation operations on deliveries, payments, and stock support `X-Idempotency-Key` or payload UUIDs.
- **Standard Error Response**:
```json
{
  "success": false,
  "error": {
    "code": "LICENSE_EXPIRED | VALIDATION_ERROR | UNAUTHORIZED | FORBIDDEN | NOT_FOUND",
    "message": "Human readable error description",
    "details": {}
  }
}
```

---

## 2. API Endpoint Groups

### 2.1 Authentication & Profile (`/api/v1/auth`)
- `POST /api/v1/auth/login`: Email/password authentication, returns JWT access and refresh tokens.
- `POST /api/v1/auth/refresh`: Refreshes access token via valid refresh token.
- `POST /api/v1/auth/otp/send`: Sends OTP to phone number (for customers & delivery personnel).
- `POST /api/v1/auth/otp/verify`: Verifies OTP and returns auth tokens.
- `GET  /api/v1/auth/me`: Returns current user identity, permissions, tenant status, and active license details.
- `POST /api/v1/auth/logout`: Revokes refresh token.

### 2.2 Super Admin / SaaS Control Plane (`/api/v1/platform`)
- `GET  /api/v1/platform/dashboard`: Global MRR, ARR, active tenants, churn, subscription breakdown.
- `GET  /api/v1/platform/tenants`: List all registered tenants with filtering, status, and metrics.
- `POST /api/v1/platform/tenants`: Manually provision a new tenant.
- `GET  /api/v1/platform/tenants/{id}`: Detailed tenant information, license validity, usage limits, and branches.
- `PATCH /api/v1/platform/tenants/{id}/status`: Activate, suspend, or deactivate tenant.
- `POST /api/v1/platform/tenants/{id}/impersonate`: Issue audited support token to inspect tenant workspace.
- `GET  /api/v1/platform/plans`: List all SaaS subscription plans.
- `POST /api/v1/platform/plans`: Create a new subscription plan (pricing, limits, features).
- `PUT  /api/v1/platform/plans/{id}`: Update plan details and feature flags.
- `POST /api/v1/platform/licenses/issue`: Manually issue or renew a tenant license.
- `POST /api/v1/platform/licenses/extend`: Extend license validity date or grace period.
- `GET  /api/v1/platform/audit-logs`: View platform-wide security and administration audit logs.

### 2.3 Tenant Onboarding (`/api/v1/onboarding`)
- `POST /api/v1/onboarding/register`: Self-service tenant signup (business name, owner, mobile, email).
- `POST /api/v1/onboarding/config`: Setup initial branch, default products (20L Jar, 1L Pet, Dispenser), and tax settings.
- `POST /api/v1/onboarding/customers/import`: CSV upload with column mapping, duplicate detection, and opening balances.
- `POST /api/v1/onboarding/complete`: Finalize onboarding, activate trial license, and redirect to dashboard.

### 2.4 Tenant Business Administration (`/api/v1/admin`)
- `GET  /api/v1/admin/dashboard`: Operational KPIs (today's deliveries, collection, jar circulation, active customers).
- `GET  /api/v1/admin/branches`: List tenant branches.
- `POST /api/v1/admin/branches`: Create a branch.
- `GET  /api/v1/admin/employees`: List staff, delivery drivers, and managers with roles.
- `POST /api/v1/admin/employees`: Invite or register employee.

### 2.5 Customers & Ledger (`/api/v1/customers`)
- `GET  /api/v1/customers`: Paginated, filterable customer list (by route, branch, status, outstanding balance).
- `POST /api/v1/customers`: Register new customer with credit limits, jar holding limit, and route.
- `GET  /api/v1/customers/{id}`: Detailed customer view, active subscriptions, jar balance, ledger balance.
- `PUT  /api/v1/customers/{id}`: Update customer profile.
- `GET  /api/v1/customers/{id}/ledger`: Immutable debit/credit ledger transactions and statement export.
- `POST /api/v1/customers/{id}/pricing`: Set custom product-specific pricing.
- `GET  /api/v1/customers/{id}/qr`: Get unique QR code for driver verification.

### 2.6 Products & Inventory (`/api/v1/products` & `/api/v1/inventory`)
- `GET  /api/v1/products`: List catalog products (returnable flags, deposit values, GST rate).
- `POST /api/v1/products`: Create new product.
- `GET  /api/v1/inventory/status`: Multi-state jar stock status (warehouse full/empty, in-transit, with customers, damaged).
- `POST /api/v1/inventory/adjust`: Record auditable stock adjustment or damage write-off.
- `POST /api/v1/inventory/transfer`: Transfer inventory between warehouse and delivery vehicle/branch.

### 2.7 Subscriptions & Recurring Deliveries (`/api/v1/subscriptions`)
- `GET  /api/v1/subscriptions`: List customer delivery subscriptions (daily, alternate, weekly, custom).
- `POST /api/v1/subscriptions`: Create recurring subscription with scheduled days and quantity.
- `PATCH /api/v1/subscriptions/{id}/pause`: Pause subscription with auto-resume date.
- `PATCH /api/v1/subscriptions/{id}/resume`: Resume paused subscription.

### 2.8 Delivery Operations (`/api/v1/deliveries`)
- `POST /api/v1/deliveries/generate`: Trigger daily delivery task generation from subscriptions.
- `GET  /api/v1/deliveries/today`: List today's dispatch sheet grouped by route and driver.
- `POST /api/v1/deliveries/record`: Record a delivery stop (delivered qty, empty jars collected, cash collected, failure reason).
- `POST /api/v1/deliveries/sync`: Bulk synchronization of offline delivery actions from mobile PWA.

### 2.9 Invoicing & Financials (`/api/v1/invoices` & `/api/v1/payments`)
- `GET  /api/v1/invoices`: List invoices with status (draft, unpaid, paid, overdue).
- `POST /api/v1/invoices/generate-monthly`: Bulk generate monthly cycle invoices for customers.
- `POST /api/v1/invoices`: Create manual invoice.
- `GET  /api/v1/invoices/{id}/pdf`: Render branded PDF invoice.
- `POST /api/v1/payments`: Record payment collection (Cash, UPI, Cheque, Bank Transfer).
- `POST /api/v1/payments/razorpay/create-order`: Initialize Razorpay payment order for customer portal.
- `POST /api/v1/payments/razorpay/webhook`: Verified webhook receiver for digital payment capture.

### 2.10 Customer Portal API (`/api/v1/portal`)
- `GET  /api/v1/portal/me`: Profile details, dues, empty jar balance, supplier contact information.
- `GET  /api/v1/portal/deliveries`: Delivery order history with granular timeline (scheduled -> dispatched -> doorstep delivered/failed) and jar counts.
- `POST /api/v1/portal/order-extra`: On-demand extra water jar order request with preferred date and shift.
- `GET  /api/v1/portal/requests`: Service and support ticket tracking with multi-stage progress timeline.
- `POST /api/v1/portal/request`: Categorized ticket submission (extra water, vacation pause, jar leakage, damaged seal, timing change, billing query).
- `GET  /api/v1/portal/ledger`: Full immutable debit/credit transaction ledger with running balance.
- `POST /api/v1/portal/pay`: Instant online payment reconciliation via UPI/Cards.
- `GET  /api/v1/portal/invoices`: Monthly GST tax invoice history with itemized product lines.
- `POST /api/v1/portal/vacation-pause`: Vacation schedule pause with auto-resume date.

