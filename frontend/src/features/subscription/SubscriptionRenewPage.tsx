import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  CreditCard, 
  ShieldCheck, 
  AlertTriangle, 
  ShieldAlert, 
  Sparkles, 
  Clock, 
  CheckCircle2,
  RefreshCw
} from 'lucide-react';

export const SubscriptionRenewPage: React.FC = () => {
  const { license, renewLicense, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);

  const handleRenew = async () => {
    setLoading(true);
    try {
      const ok = await renewLicense(days);
      if (ok) {
        alert(`Subscription successfully renewed for ${days} days! All operations are active.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const isExpired = license && (license.status === 'expired' || license.status === 'suspended');
  const isGracePeriod = license && license.status === 'grace_period';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">SaaS Subscription & License Status</h1>
        <p className="text-xs text-slate-500">Manage plan tier, license validity, and operation entitlements</p>
      </div>

      {/* License Status Card */}
      <div className={`p-6 rounded-2xl border shadow-sm ${
        isExpired
          ? 'bg-rose-50/60 border-rose-200'
          : isGracePeriod
          ? 'bg-amber-50/60 border-amber-200'
          : 'bg-white border-slate-200'
      }`}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center space-x-2">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                isExpired
                  ? 'bg-rose-100 text-rose-800'
                  : isGracePeriod
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}>
                {license?.status || 'Active'}
              </span>
              <span className="text-xs font-mono text-slate-400">{license?.key}</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-2">
              {isExpired ? 'Operational Operations Suspended' : 'Enterprise Operational License'}
            </h2>
          </div>

          <div className="text-right">
            <div className="text-xs text-slate-500">License Expiry Date</div>
            <div className="text-base font-bold text-slate-900">
              {license?.expires_at ? new Date(license.expires_at).toLocaleDateString() : 'Active Lifetime'}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Grace Period: {license?.grace_period_days || 7} Days
            </div>
          </div>
        </div>

        {license?.restriction_reason && (
          <div className="mt-4 p-3 bg-white/80 rounded-xl border border-rose-200 text-xs text-rose-700">
            <strong>System Notification:</strong> {license.restriction_reason}
          </div>
        )}

        {/* Renewal Checkout Box */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center space-x-3">
            <span className="text-xs font-medium text-slate-700">Select Renewal Period:</span>
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold bg-white"
            >
              <option value={30}>30 Days (₹2,499)</option>
              <option value={90}>90 Days (₹6,999)</option>
              <option value={365}>1 Year (₹24,990)</option>
            </select>
          </div>

          <button
            onClick={handleRenew}
            disabled={loading}
            className="w-full sm:w-auto px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-bold shadow-md transition disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Pay & Renew License'}
          </button>
        </div>
      </div>

      {/* Feature Entitlements Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <h3 className="font-bold text-sm text-slate-900">Active Plan Entitlements</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>Multi-Branch & RO Plant Management</span>
          </div>
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>Driver PWA & Offline Synchronization</span>
          </div>
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>Unique Customer QR Code Verification</span>
          </div>
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>8-State Returnable Container Stock Tracking</span>
          </div>
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>Automated GST Cycle Invoicing</span>
          </div>
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>Customer Self-Service Vacation Pause Portal</span>
          </div>
        </div>
      </div>
    </div>
  );
};

