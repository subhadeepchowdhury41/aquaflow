import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Building2, 
  Layers, 
  ShieldCheck, 
  LogOut, 
  BarChart3, 
  Droplet
} from 'lucide-react';

export const PlatformLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/auth/login');
  };

  const navItems = [
    { label: 'Platform Overview', path: '/platform', icon: BarChart3 },
    { label: 'Tenants Directory', path: '/platform/tenants', icon: Building2 },
    { label: 'Subscription Plans', path: '/platform/plans', icon: Layers },
    { label: 'Platform Audit Logs', path: '/platform/audit-logs', icon: ShieldCheck },
  ];

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 bg-slate-950 flex flex-col justify-between">
        <div>
          <div className="p-6 border-b border-slate-800 flex items-center space-x-3">
            <div className="bg-brand-500 p-2 rounded-xl text-white shadow-lg shadow-brand-500/20">
              <Droplet className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight text-white">AquaFlow</h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30">
                SaaS Control Plane
              </span>
            </div>
          </div>

          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-500 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User bar */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between">
          <div className="truncate">
            <div className="text-xs text-slate-400">Signed in as</div>
            <div className="text-sm font-semibold text-white truncate">{user?.full_name || 'Super Admin'}</div>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-900 rounded-lg transition-colors"
            title="Log Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-900">
        <header className="h-16 border-b border-slate-800 bg-slate-900/60 backdrop-blur px-8 flex items-center justify-between">
          <div className="text-sm text-slate-400">
            Platform Administration & Entitlements
          </div>
          <div className="flex items-center space-x-4">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-2 animate-pulse" />
              SaaS Engine Live
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

