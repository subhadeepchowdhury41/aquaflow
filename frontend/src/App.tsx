import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

// Layouts
import { PlatformLayout } from '@/layouts/PlatformLayout';
import { TenantLayout } from '@/layouts/TenantLayout';

// Pages
import { LoginPage } from '@/features/auth/LoginPage';
import { OnboardingPage } from '@/features/auth/OnboardingPage';
import { PlatformDashboard } from '@/features/platform-admin/PlatformDashboard';
import { SubscriptionPlansPage } from '@/features/platform-admin/SubscriptionPlansPage';
import { TenantDashboard } from '@/features/tenant-dashboard/TenantDashboard';
import { DeliveriesPage } from '@/features/deliveries/DeliveriesPage';
import { CustomersPage } from '@/features/customers/CustomersPage';
import { InventoryPage } from '@/features/inventory/InventoryPage';
import { InvoicesPage } from '@/features/invoices/InvoicesPage';
import { StaffPage } from '@/features/staff/StaffPage';
import { SubscriptionRenewPage } from '@/features/subscription/SubscriptionRenewPage';
import { DriverPortal } from '@/features/delivery-portal/DriverPortal';
import { CustomerPortal } from '@/features/customer-portal/CustomerPortal';

const ProtectedRoute: React.FC<{ children: React.ReactNode; requiresAdmin?: boolean }> = ({
  children,
  requiresAdmin,
}) => {
  const { user, isLoading } = useAuth();
  const token = localStorage.getItem('aquaflow_token');

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white text-sm">
        Loading AquaFlow session...
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/auth/login" replace />;
  }

  if (requiresAdmin && !user?.is_super_admin) {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Authentication */}
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="/auth/register" element={<OnboardingPage />} />

          {/* Super Admin SaaS Control Plane */}
          <Route
            path="/platform"
            element={
              <ProtectedRoute requiresAdmin>
                <PlatformLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<PlatformDashboard />} />
            <Route path="tenants" element={<PlatformDashboard />} />
            <Route path="plans" element={<SubscriptionPlansPage />} />
            <Route path="audit-logs" element={<PlatformDashboard />} />
          </Route>

          {/* Tenant Business Management */}
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <TenantLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<TenantDashboard />} />
            <Route path="deliveries" element={<DeliveriesPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="staff" element={<StaffPage />} />
            <Route path="subscription" element={<SubscriptionRenewPage />} />
          </Route>

          {/* Delivery Driver Mobile-first PWA */}
          <Route path="/delivery" element={<DriverPortal />} />

          {/* Customer Self-Service Portal */}
          <Route path="/customer" element={<CustomerPortal />} />

          {/* Root redirect */}
          <Route path="*" element={<Navigate to="/auth/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
