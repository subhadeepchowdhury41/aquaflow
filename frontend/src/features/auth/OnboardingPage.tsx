import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/api/client';
import { Droplet, ArrowRight, CheckCircle2, Building, ShieldCheck, Sparkles } from 'lucide-react';

export const OnboardingPage: React.FC = () => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    business_name: '',
    owner_name: '',
    email: '',
    phone: '',
    password: '',
    address: '',
    gstin: '',
    business_category: 'water_jars',
    branch_name: 'Main Plant',
    default_20l_price: 40.0,
    default_jar_deposit: 150.0,
    gst_percentage: 18.0,
    plan_slug: 'starter',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name.includes('price') || name.includes('deposit') || name.includes('percentage')
        ? parseFloat(value) || 0
        : value,
    }));
  };

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 3) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiClient.post('/onboarding/register', formData);
      await login(res.data.access_token, res.data.refresh_token);
      navigate('/app');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Onboarding failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-xl text-center">
        <div className="inline-flex p-3 bg-brand-500 rounded-2xl text-white shadow-xl shadow-brand-500/30 mb-3">
          <Droplet className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Onboard Your Water Delivery Business</h2>
        <p className="mt-1 text-sm text-slate-400">
          Setup your multi-branch agency, jar deposits, routes, and start a 14-day trial
        </p>

        {/* Progress Stepper */}
        <div className="flex items-center justify-center space-x-8 mt-6">
          <div className={`flex items-center space-x-2 text-xs font-semibold ${step >= 1 ? 'text-brand-400' : 'text-slate-600'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center border ${step >= 1 ? 'border-brand-400 bg-brand-500/20' : 'border-slate-700'}`}>1</span>
            <span>Business Profile</span>
          </div>
          <div className="w-12 h-0.5 bg-slate-800" />
          <div className={`flex items-center space-x-2 text-xs font-semibold ${step >= 2 ? 'text-brand-400' : 'text-slate-600'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center border ${step >= 2 ? 'border-brand-400 bg-brand-500/20' : 'border-slate-700'}`}>2</span>
            <span>Jars & Rates</span>
          </div>
          <div className="w-12 h-0.5 bg-slate-800" />
          <div className={`flex items-center space-x-2 text-xs font-semibold ${step >= 3 ? 'text-brand-400' : 'text-slate-600'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center border ${step >= 3 ? 'border-brand-400 bg-brand-500/20' : 'border-slate-700'}`}>3</span>
            <span>Subscription</span>
          </div>
        </div>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-xl">
        <div className="bg-white py-8 px-6 shadow-2xl rounded-2xl sm:px-10 border border-slate-100">
          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleNextStep}>
            {step === 1 && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-800 mb-2">Step 1: Water Supply Business Information</h3>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Company / Agency Name *</label>
                  <input
                    type="text"
                    name="business_name"
                    required
                    value={formData.business_name}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-500"
                    placeholder="e.g. Pure Aqua Springs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Owner Full Name *</label>
                    <input
                      type="text"
                      name="owner_name"
                      required
                      value={formData.owner_name}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      placeholder="e.g. Anil Kumar"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Business Mobile Number *</label>
                    <input
                      type="text"
                      name="phone"
                      required
                      value={formData.phone}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      placeholder="9876500001"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Owner Email *</label>
                    <input
                      type="email"
                      name="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      placeholder="owner@pureaqua.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Account Password *</label>
                    <input
                      type="password"
                      name="password"
                      required
                      value={formData.password}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      placeholder="Min 8 characters"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Plant / Warehouse Address *</label>
                  <input
                    type="text"
                    name="address"
                    required
                    value={formData.address}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    placeholder="Plot 10, Industrial Phase 1, Bangalore"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">GSTIN (Optional)</label>
                    <input
                      type="text"
                      name="gstin"
                      value={formData.gstin}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                      placeholder="29AAAAA0000A1Z5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Business Category</label>
                    <select
                      name="business_category"
                      value={formData.business_category}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                    >
                      <option value="water_jars">Water Jar Delivery (20L)</option>
                      <option value="ro_plant">RO Water Purification Plant</option>
                      <option value="bulk_water">Bulk Tanker Logistics</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-800 mb-2">Step 2: Plant Configuration & Rates</h3>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Primary Plant / Branch Name</label>
                  <input
                    type="text"
                    name="branch_name"
                    value={formData.branch_name}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Default 20L Jar Selling Price (₹)</label>
                    <input
                      type="number"
                      name="default_20l_price"
                      value={formData.default_20l_price}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Returnable Jar Deposit (₹)</label>
                    <input
                      type="number"
                      name="default_jar_deposit"
                      value={formData.default_jar_deposit}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Applicable GST Tax Rate (%)</label>
                  <input
                    type="number"
                    name="gst_percentage"
                    value={formData.gst_percentage}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-800 mb-2">Step 3: Choose Your SaaS Subscription Plan</h3>
                <div className="space-y-3">
                  <label
                    className={`block p-4 border rounded-xl cursor-pointer transition ${
                      formData.plan_slug === 'starter'
                        ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/20'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name="plan_slug"
                          value="starter"
                          checked={formData.plan_slug === 'starter'}
                          onChange={handleChange}
                        />
                        <span className="font-bold text-sm text-slate-900">Starter Plan (14-Day Free Trial)</span>
                      </div>
                      <span className="text-xs font-bold text-brand-600 bg-brand-100 px-2 py-0.5 rounded">FREE TRIAL</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 ml-6">
                      Up to 150 Customers, 3 Drivers, 1 Branch, Mobile Driver PWA & QR Codes.
                    </p>
                  </label>

                  <label
                    className={`block p-4 border rounded-xl cursor-pointer transition ${
                      formData.plan_slug === 'professional'
                        ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/20'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name="plan_slug"
                          value="professional"
                          checked={formData.plan_slug === 'professional'}
                          onChange={handleChange}
                        />
                        <span className="font-bold text-sm text-slate-900">Professional Growth</span>
                      </div>
                      <span className="text-xs font-bold text-slate-700">₹2,499 / mo</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 ml-6">
                      Up to 1,000 Customers, 15 Drivers, 3 Branches, Bulk Invoicing & WhatsApp integration.
                    </p>
                  </label>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Back
                </button>
              ) : (
                <Link to="/auth/login" className="text-xs text-slate-500 hover:text-slate-800">
                  Already have an account? Log In
                </Link>
              )}

              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-semibold shadow-sm transition disabled:opacity-50"
              >
                {loading ? 'Setting up...' : step === 3 ? 'Activate Business & Start' : 'Continue'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

