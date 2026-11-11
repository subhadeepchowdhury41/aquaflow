from enum import Enum
from typing import List, Set
from fastapi import HTTPException, status, Depends


class SystemRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    TENANT_OWNER = "tenant_owner"
    BRANCH_MANAGER = "branch_manager"
    ACCOUNTANT = "accountant"
    DELIVERY_DRIVER = "delivery_driver"
    CUSTOMER = "customer"
    SUPPORT_STAFF = "support_staff"


class Permission(str, Enum):
    # Platform Super Admin
    SUPER_ADMIN_ACCESS = "platform:super_admin"
    TENANT_MANAGE = "platform:tenants_manage"
    SUBSCRIPTION_PLANS_MANAGE = "platform:plans_manage"
    SUPPORT_IMPERSONATE = "platform:impersonate"

    # Tenant Administration & Branches
    TENANT_PROFILE_WRITE = "tenant:profile_write"
    BRANCH_READ = "tenant:branch_read"
    BRANCH_WRITE = "tenant:branch_write"
    STAFF_MANAGE = "tenant:staff_manage"
    ROLE_MANAGE = "tenant:roles_manage"

    # Customers & Ledgers
    CUSTOMER_READ = "customer:read"
    CUSTOMER_WRITE = "customer:write"
    CUSTOMER_LEDGER_VIEW = "customer:ledger_view"
    CUSTOMER_LEDGER_ADJUST = "customer:ledger_adjust"

    # Products & Inventory
    PRODUCT_READ = "product:read"
    PRODUCT_WRITE = "product:write"
    INVENTORY_READ = "inventory:read"
    INVENTORY_WRITE = "inventory:write"
    INVENTORY_TRANSFER = "inventory:transfer"

    # Subscriptions & Deliveries
    SUBSCRIPTION_READ = "subscription:read"
    SUBSCRIPTION_WRITE = "subscription:write"
    DELIVERY_TASK_GENERATE = "delivery:task_generate"
    DELIVERY_READ = "delivery:read"
    DELIVERY_RECORD = "delivery:record"
    DELIVERY_DRIVER_ACCESS = "delivery:driver_access"

    # Invoices & Finance
    INVOICE_READ = "invoice:read"
    INVOICE_WRITE = "invoice:write"
    PAYMENT_READ = "payment:read"
    PAYMENT_RECORD = "payment:record"
    EXPENSE_MANAGE = "expense:manage"
    PAYROLL_MANAGE = "payroll:manage"

    # Customer Self-Service
    CUSTOMER_PORTAL_ACCESS = "customer:portal_access"

    # Reports
    REPORT_READ = "report:read"


# Default permission matrix assigned to default system roles
ROLE_PERMISSIONS: dict[SystemRole, Set[Permission]] = {
    SystemRole.SUPER_ADMIN: {
        Permission.SUPER_ADMIN_ACCESS,
        Permission.TENANT_MANAGE,
        Permission.SUBSCRIPTION_PLANS_MANAGE,
        Permission.SUPPORT_IMPERSONATE,
    },
    SystemRole.TENANT_OWNER: {
        Permission.TENANT_PROFILE_WRITE,
        Permission.BRANCH_READ,
        Permission.BRANCH_WRITE,
        Permission.STAFF_MANAGE,
        Permission.ROLE_MANAGE,
        Permission.CUSTOMER_READ,
        Permission.CUSTOMER_WRITE,
        Permission.CUSTOMER_LEDGER_VIEW,
        Permission.CUSTOMER_LEDGER_ADJUST,
        Permission.PRODUCT_READ,
        Permission.PRODUCT_WRITE,
        Permission.INVENTORY_READ,
        Permission.INVENTORY_WRITE,
        Permission.INVENTORY_TRANSFER,
        Permission.SUBSCRIPTION_READ,
        Permission.SUBSCRIPTION_WRITE,
        Permission.DELIVERY_TASK_GENERATE,
        Permission.DELIVERY_READ,
        Permission.DELIVERY_RECORD,
        Permission.INVOICE_READ,
        Permission.INVOICE_WRITE,
        Permission.PAYMENT_READ,
        Permission.PAYMENT_RECORD,
        Permission.EXPENSE_MANAGE,
        Permission.PAYROLL_MANAGE,
        Permission.REPORT_READ,
    },
    SystemRole.BRANCH_MANAGER: {
        Permission.BRANCH_READ,
        Permission.CUSTOMER_READ,
        Permission.CUSTOMER_WRITE,
        Permission.CUSTOMER_LEDGER_VIEW,
        Permission.PRODUCT_READ,
        Permission.INVENTORY_READ,
        Permission.INVENTORY_WRITE,
        Permission.INVENTORY_TRANSFER,
        Permission.SUBSCRIPTION_READ,
        Permission.DELIVERY_READ,
        Permission.DELIVERY_RECORD,
        Permission.INVOICE_READ,
        Permission.PAYMENT_READ,
        Permission.PAYMENT_RECORD,
        Permission.REPORT_READ,
    },
    SystemRole.ACCOUNTANT: {
        Permission.CUSTOMER_READ,
        Permission.CUSTOMER_LEDGER_VIEW,
        Permission.CUSTOMER_LEDGER_ADJUST,
        Permission.PRODUCT_READ,
        Permission.INVOICE_READ,
        Permission.INVOICE_WRITE,
        Permission.PAYMENT_READ,
        Permission.PAYMENT_RECORD,
        Permission.EXPENSE_MANAGE,
        Permission.PAYROLL_MANAGE,
        Permission.REPORT_READ,
    },
    SystemRole.DELIVERY_DRIVER: {
        Permission.DELIVERY_DRIVER_ACCESS,
        Permission.DELIVERY_READ,
        Permission.DELIVERY_RECORD,
        Permission.PAYMENT_RECORD,
    },
    SystemRole.CUSTOMER: {
        Permission.CUSTOMER_PORTAL_ACCESS,
    },
    SystemRole.SUPPORT_STAFF: {
        Permission.TENANT_MANAGE,
        Permission.SUPPORT_IMPERSONATE,
    }
}


def get_role_permissions(role: str) -> List[str]:
    """Resolves string role name to its list of permission strings."""
    try:
        sys_role = SystemRole(role)
        perms = ROLE_PERMISSIONS.get(sys_role, set())
        return [p.value for p in perms]
    except ValueError:
        return []

