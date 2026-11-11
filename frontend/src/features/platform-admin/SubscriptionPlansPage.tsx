import React, { useState, useEffect } from 'react';
import { apiClient } from '@/api/client';
import { Layers, CheckCircle2, ShieldCheck, Plus, Sparkles } from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string;
  monthly_price: number;
  annual_price: number;
  max_customers: number;
  max_employees: number;
  max_branches: number;
  trial_days: number;
  feature_flags: Record<string, boolean>;
}

export const SubscriptionPlansPage: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await apiClient.get('/platform/plans');
        setPlans(res.data);
      } catch (err) {
        console.error('Failed to load plans', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPlans();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">SaaS Subscription Plans & Pricing</h2>
          <p className="text-xs text-slate-400">Configure multi-tenant limits, customer quotas, and platform features</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((p) => (
          <div
            key={p.id}
            className="bg-slate-950 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between shadow-xl relative overflow-hidden"
          >
            {p.slug === 'professional' && (
              <div className="absolute top-0 right-0 bg-brand-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg">
                MOST POPULAR
              </div>
            )}
            <div>
              <div className="flex items-center space-x-2 text-brand-400 mb-2">
                <Layers className="w-5 h-5" />
                <h3 className="font-bold text-lg text-white">{p.name}</h3>
              </div>
              <p className="text-xs text-slate-400 mb-4">{p.description}</p>

              <div className="mb-6">
                <span className="text-3xl font-extrabold text-white">₹{p.monthly_price.toLocaleString('en-IN')}</span>
                <span className="text-xs text-slate-400"> / month</span>
                <div className="text-[11px] text-slate-500 mt-0.5">Annual: ₹{p.annual_price.toLocaleString('en-IN')} / year</div>
              </div>

              <div className="space-y-2.5 text-xs text-slate-300 border-t border-slate-800 pt-4">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Max Customers: <strong>{p.max_customers.toLocaleString()}</strong></span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Max Staff / Drivers: <strong>{p.max_employees}</strong></span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Branches / Depots: <strong>{p.max_branches}</strong></span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Free Trial: <strong>{p.trial_days} Days</strong></span>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-800">
              <span className="block text-center text-xs font-semibold text-slate-400 bg-slate-900 py-2 rounded-lg">
                SaaS Tier Active
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

