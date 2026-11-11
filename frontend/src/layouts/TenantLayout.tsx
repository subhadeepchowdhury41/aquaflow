import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard,
  Truck,
  Users,
  Package,
  Receipt,
  UserCheck,
  CreditCard,
  LogOut,
  AlertTriangle,
  Droplet,
  ShieldAlert,
  Sparkles
} from 'lucide-react';

export const TenantLayout: React.FC = () => {
  const { user, license, logout, renewLicense } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/auth/login');
  };

  const navItems = [
    { label: 'Dashboard', path: '/app', icon: LayoutDashboard },
    { label: 'Daily Deliveries', path: '/app/deliveries', icon: Truck },
    { label: 'Customers & Ledger', path: '/app/customers', icon: Users },
    { label: 'Products & Jar Stock', path: '/app/inventory', icon: Package },
    { label: 'Invoices & Billing', path: '/app/invoices', icon: Receipt },
    { label: 'Staff & Drivers', path: '/app/staff', icon: UserCheck },
    { label: 'SaaS License', path: '/app/subscription', icon: CreditCard },
  ];

  const isExpired = license && (license.status === 'expired' || license.status === 'suspended');
  const isGracePeriod = license && license.status === 'grace_period';

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-200 bg-white flex flex-col justify-between shadow-sm">
        <div>
          <div className="p-5 border-b border-slate-100 flex items-center space-x-3">
            <div className="bg-brand-500 p-2.5 rounded-xl text-white shadow-md shadow-brand-500/20">
              <Droplet className="w-6 h-6" />
            </div>
            <div className="truncate">
              <h1 className="font-bold text-base text-slate-900 tracking-tight truncate">
                AquaFlow
              </h1>
              <span className="text-xs text-brand-600 font-medium">
                Agency Operations
              </span>
            </div>
          </div>

          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/20'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* License status in sidebar */}
        <div className="p-4 border-t border-slate-100">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium text-slate-500">Plan Status</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  isExpired
                    ? 'bg-rose-100 text-rose-700'
                    : isGracePeriod
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {license?.status || 'Active'}
              </span>
            </div>
            {license?.expires_at && (
              <div className="text-[11px] text-slate-500">
                Expires: {new Date(license.expires_at).toLocaleDateString()}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="truncate">
              <div className="text-xs font-semibold text-slate-900 truncate">
                {user?.full_name}
              </div>
              <div className="text-[11px] text-slate-400 capitalize">{user?.role?.replace('_', ' ')}</div>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Warning Banners */}
        {isGracePeriod && (
          <div className="bg-amber-500 text-white px-6 py-2.5 flex items-center justify-between text-sm shadow-sm">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span>
                <strong>Subscription in Grace Period:</strong> Your license has expired. Please renew before the grace period ends to prevent business operation stoppage.
              </span>
            </div>
            <button
              onClick={() => renewLicense(30)}
              className="bg-white text-amber-800 px-3 py-1 rounded font-semibold text-xs hover:bg-amber-50 transition shadow-sm"
            >
              Renew for 30 Days
            </button>
          </div>
        )}

        {isExpired && (
          <div className="bg-rose-600 text-white px-6 py-3 flex items-center justify-between text-sm shadow-md animate-pulse">
            <div className="flex items-center space-x-3">
              <ShieldAlert className="w-6 h-6 flex-shrink-0" />
              <div>
                <strong>LICENSE EXPIRED & OPERATIONS LOCKED:</strong> New deliveries, invoice generation, and customer operations are blocked. Historical records remain preserved.
              </div>
            </div>
            <button
              onClick={() => renewLicense(30)}
              className="bg-white text-rose-700 px-4 py-1.5 rounded-lg font-bold text-xs hover:bg-rose-50 transition shadow-sm"
            >
              Renew & Restore Access
            </button>
          </div>
        )}

        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h2 className="text-sm font-semibold text-slate-700">Water Plant Management Portal</h2>
          </div>
          <div className="flex items-center space-x-3">
            <Link
              to="/delivery"
              target="_blank"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100 transition"
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Open Driver PWA</span>
            </Link>
            <Link
              to="/customer"
              target="_blank"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Customer Portal Preview</span>
            </Link>
          </div>
        </header>

        {/* View Content */}
        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

