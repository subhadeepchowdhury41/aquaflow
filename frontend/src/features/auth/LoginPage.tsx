import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/api/client';
import { Droplet, Lock, Mail, Phone, ArrowRight, Shield, CheckCircle2 } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [isOtpMode, setIsOtpMode] = useState(false);
  const [emailOrPhone, setEmailOrPhone] = useState('owner@aquapure.com');
  const [password, setPassword] = useState('Password@123');
  const [phone, setPhone] = useState('9876543210');
  const [otp, setOtp] = useState('123456');
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await apiClient.post('/auth/login', {
        email_or_phone: emailOrPhone,
        password: password,
      });

      await login(res.data.access_token, res.data.refresh_token);

      // Routing according to user context
      const profile = await apiClient.get('/auth/me');
      if (profile.data.is_super_admin) {
        navigate('/platform');
      } else if (profile.data.role === 'delivery_driver') {
        navigate('/delivery');
      } else {
        navigate('/app');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.response?.data?.error || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async () => {
    setError(null);
    setLoading(true);
    try {
      await apiClient.post('/auth/otp/send', { phone });
      setOtpSent(true);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiClient.post('/auth/otp/verify', { phone, otp });
      await login(res.data.access_token, res.data.refresh_token);

      const profile = await apiClient.get('/auth/me');
      if (profile.data.role === 'customer') {
        navigate('/customer');
      } else if (profile.data.role === 'delivery_driver') {
        navigate('/delivery');
      } else {
        navigate('/app');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (type: 'admin' | 'owner' | 'driver' | 'customer') => {
    setError(null);
    if (type === 'admin') {
      setIsOtpMode(false);
      setEmailOrPhone('superadmin@aquaflow.io');
      setPassword('Admin@AquaFlow2026!');
    } else if (type === 'owner') {
      setIsOtpMode(false);
      setEmailOrPhone('owner@aquapure.com');
      setPassword('Password@123');
    } else if (type === 'driver') {
      setIsOtpMode(false);
      setEmailOrPhone('driver1@aquapure.com');
      setPassword('Password@123');
    } else if (type === 'customer') {
      setIsOtpMode(true);
      setPhone('9876543210');
      setOtp('123456');
      setOtpSent(true);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-brand-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex p-3 bg-brand-500 rounded-2xl text-white shadow-xl shadow-brand-500/30 mb-4">
          <Droplet className="w-10 h-10" />
        </div>
        <h2 className="text-3xl font-extrabold text-white tracking-tight">AquaFlow Platform</h2>
        <p className="mt-2 text-sm text-slate-300">
          Multi-Tenant Water Delivery & RO Management SaaS
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-2xl rounded-2xl sm:px-10 border border-slate-100">
          {/* Mode Switcher */}
          <div className="flex rounded-lg bg-slate-100 p-1 mb-6">
            <button
              type="button"
              onClick={() => { setIsOtpMode(false); setError(null); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                !isOtpMode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Password Login
            </button>
            <button
              type="button"
              onClick={() => { setIsOtpMode(true); setError(null); }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                isOtpMode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Phone OTP (Customer/Driver)
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs font-medium">
              {error}
            </div>
          )}

          {!isOtpMode ? (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Email Address or Mobile Number
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={emailOrPhone}
                    onChange={(e) => setEmailOrPhone(e.target.value)}
                    className="block w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    placeholder="e.g. owner@aquapure.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 disabled:opacity-50 transition"
              >
                {loading ? 'Authenticating...' : 'Sign In to Account'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Registered Phone</label>
                <div className="relative flex">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Phone className="h-4 w-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="block w-full pl-9 pr-3 py-2 border border-slate-300 rounded-l-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    placeholder="9876543210"
                  />
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    className="px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 border-y border-r border-slate-300 rounded-r-lg text-xs font-semibold"
                  >
                    Send OTP
                  </button>
                </div>
              </div>

              {otpSent && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Enter 6-Digit OTP</label>
                  <input
                    type="text"
                    required
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="block w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-center font-mono tracking-widest text-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    placeholder="123456"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">Demo test OTP is always 123456</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !otpSent}
                className="w-full mt-2 flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 disabled:opacity-50 transition"
              >
                {loading ? 'Verifying...' : 'Verify OTP & Log In'}
              </button>
            </form>
          )}

          {/* Quick Demo Fill Buttons */}
          <div className="mt-6 pt-5 border-t border-slate-200">
            <span className="text-xs font-semibold text-slate-500 block mb-2.5">
              Instant 1-Click Demo Profiles:
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => fillDemo('admin')}
                className="p-2 border border-slate-200 rounded-lg text-left text-xs hover:border-brand-500 hover:bg-brand-50 transition"
              >
                <div className="font-semibold text-slate-900">Super Admin</div>
                <div className="text-[10px] text-slate-500">SaaS Control Plane</div>
              </button>
              <button
                type="button"
                onClick={() => fillDemo('owner')}
                className="p-2 border border-slate-200 rounded-lg text-left text-xs hover:border-brand-500 hover:bg-brand-50 transition"
              >
                <div className="font-semibold text-slate-900">Water Agency Owner</div>
                <div className="text-[10px] text-slate-500">Full Business Suite</div>
              </button>
              <button
                type="button"
                onClick={() => fillDemo('driver')}
                className="p-2 border border-slate-200 rounded-lg text-left text-xs hover:border-brand-500 hover:bg-brand-50 transition"
              >
                <div className="font-semibold text-slate-900">Delivery Driver</div>
                <div className="text-[10px] text-slate-500">Mobile PWA App</div>
              </button>
              <button
                type="button"
                onClick={() => fillDemo('customer')}
                className="p-2 border border-slate-200 rounded-lg text-left text-xs hover:border-brand-500 hover:bg-brand-50 transition"
              >
                <div className="font-semibold text-slate-900">Consumer</div>
                <div className="text-[10px] text-slate-500">Self-Service Portal</div>
              </button>
            </div>
          </div>

          <div className="mt-6 text-center">
            <Link
              to="/auth/register"
              className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center justify-center space-x-1"
            >
              <span>Starting a new water business? Sign up here</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

