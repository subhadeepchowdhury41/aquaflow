import React, { useState, useEffect } from 'react';
import { apiClient } from '@/api/client';
import { 
  Building2, 
  TrendingUp, 
  Users, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  ExternalLink,
  ShieldAlert,
  CalendarPlus,
  Search
} from 'lucide-react';

interface TenantItem {
  id: string;
  name: string;
  owner_name: string;
  email: string;
  phone: string;
  status: string;
  created_at: string;
  customer_count: number;
  employee_count: number;
  branch_count: number;
  license?: {
    license_key: string;
    status: string;
    expires_at: string | null;
    grace_period_days: number;
  };
}

interface PlatformStats {
  total_tenants: number;
  active_tenants: number;
  trial_tenants: number;
  suspended_tenants: number;
  mrr: number;
  arr: number;
  churn_rate: number;
}

export const PlatformDashboard: React.FC = () => {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedTenant, setSelectedTenant] = useState<TenantItem | null>(null);
  const [extendDays, setExtendDays] = useState(30);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statsRes, tenantsRes] = await Promise.all([
        apiClient.get('/platform/dashboard'),
        apiClient.get('/platform/tenants')
      ]);
      setStats(statsRes.data);
      setTenants(tenantsRes.data);
    } catch (err) {
      console.error('Failed to load platform data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleStatusToggle = async (tenantId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      await apiClient.patch(`/platform/tenants/${tenantId}/status`, { status: nextStatus });
      await fetchData();
    } catch (err) {
      alert('Failed to update tenant status');
    }
  };

  const handleExtendLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant) return;
    try {
      await apiClient.post(`/platform/licenses/extend?tenant_id=${selectedTenant.id}`, {
        additional_days: extendDays,
        notes: 'Extended via Super Admin Control Plane'
      });
      setSelectedTenant(null);
      await fetchData();
    } catch (err) {
      alert('Failed to extend license');
    }
  };

  const handleImpersonate = async (tenantId: string) => {
    try {
      const res = await apiClient.post(`/platform/tenants/${tenantId}/impersonate`);
      localStorage.setItem('aquaflow_token', res.data.access_token);
      window.location.href = '/app';
    } catch (err) {
      alert('Impersonation failed');
    }
  };

  const filteredTenants = tenants.filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.email.toLowerCase().includes(search.toLowerCase()) ||
    t.phone.includes(search)
  );

  return (
    <div className="space-y-8">
      {/* SaaS High-Level Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Monthly Recurring Revenue</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white tracking-tight">
            ₹{stats?.mrr.toLocaleString('en-IN') || 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">ARR: ₹{(stats?.arr || 0).toLocaleString('en-IN')}</div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Total Water Agencies</span>
            <Building2 className="w-4 h-4 text-brand-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white tracking-tight">
            {stats?.total_tenants || 0}
          </div>
          <div className="text-[11px] text-emerald-400 mt-1">{stats?.active_tenants || 0} Active Live</div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Free Trial Businesses</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white tracking-tight">
            {stats?.trial_tenants || 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">14-Day Free Evaluation</div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Suspended / Churn</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white tracking-tight">
            {stats?.suspended_tenants || 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Monthly Churn: {stats?.churn_rate || 0}%</div>
        </div>
      </div>

      {/* Tenants Table */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            <h3 className="text-base font-bold text-white">Registered Water Supply Businesses</h3>
            <p className="text-xs text-slate-400">Manage tenant isolation, license validity, and audited impersonation</p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by business, email..."
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/60 text-slate-400 font-semibold border-b border-slate-800">
              <tr>
                <th className="p-4">Water Business & Owner</th>
                <th className="p-4">Contact</th>
                <th className="p-4">Branches</th>
                <th className="p-4">Customers</th>
                <th className="p-4">License Health</th>
                <th className="p-4">Tenant Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {filteredTenants.map((t) => (
                <tr key={t.id} className="hover:bg-slate-900/40 transition">
                  <td className="p-4">
                    <div className="font-semibold text-white">{t.name}</div>
                    <div className="text-slate-500 text-[11px]">{t.owner_name}</div>
                  </td>
                  <td className="p-4">
                    <div>{t.email}</div>
                    <div className="text-slate-500">{t.phone}</div>
                  </td>
                  <td className="p-4 font-mono">{t.branch_count}</td>
                  <td className="p-4 font-mono">{t.customer_count}</td>
                  <td className="p-4">
                    <div className="flex items-center space-x-1.5">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${
                          t.license?.status === 'active'
                            ? 'bg-emerald-400'
                            : t.license?.status === 'trial'
                            ? 'bg-blue-400'
                            : t.license?.status === 'grace_period'
                            ? 'bg-amber-400'
                            : 'bg-rose-400'
                        }`}
                      />
                      <span className="capitalize font-medium">{t.license?.status || 'Active'}</span>
                    </div>
                    {t.license?.expires_at && (
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Exp: {new Date(t.license.expires_at).toLocaleDateString()}
                      </div>
                    )}
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        t.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <button
                      onClick={() => handleStatusToggle(t.id, t.status)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                        t.status === 'active'
                          ? 'bg-slate-800 text-rose-300 hover:bg-rose-950'
                          : 'bg-emerald-600 text-white hover:bg-emerald-500'
                      }`}
                    >
                      {t.status === 'active' ? 'Suspend' : 'Activate'}
                    </button>
                    <button
                      onClick={() => setSelectedTenant(t)}
                      className="px-2.5 py-1 rounded text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
                      title="Extend License"
                    >
                      Extend
                    </button>
                    <button
                      onClick={() => handleImpersonate(t.id)}
                      className="px-2.5 py-1 rounded text-xs font-semibold bg-brand-500 text-white hover:bg-brand-400 transition"
                      title="Audited Support Impersonation"
                    >
                      Impersonate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Extend License Modal */}
      {selectedTenant && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h4 className="text-base font-bold text-white mb-1">
              Extend SaaS License: {selectedTenant.name}
            </h4>
            <p className="text-xs text-slate-400 mb-4">
              Add validity days directly to the tenant's license without payment friction.
            </p>
            <form onSubmit={handleExtendLicense} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Days to Extend</label>
                <select
                  value={extendDays}
                  onChange={(e) => setExtendDays(parseInt(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200"
                >
                  <option value={15}>15 Days</option>
                  <option value={30}>30 Days (1 Month)</option>
                  <option value={90}>90 Days (1 Quarter)</option>
                  <option value={365}>365 Days (1 Year)</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedTenant(null)}
                  className="px-4 py-2 border border-slate-700 rounded-lg text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-500 hover:bg-brand-600 rounded-lg text-xs font-semibold text-white shadow-sm"
                >
                  Save & Update License
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

