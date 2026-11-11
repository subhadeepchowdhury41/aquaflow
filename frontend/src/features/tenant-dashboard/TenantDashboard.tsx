import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '@/api/client';
import { 
  Truck, 
  Users, 
  Package, 
  Receipt, 
  ArrowUpRight, 
  PlusCircle, 
  RefreshCw, 
  CheckCircle, 
  Clock, 
  IndianRupee,
  Layers
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export const TenantDashboard: React.FC = () => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [tasksRes, invRes, custRes] = await Promise.all([
        apiClient.get('/deliveries/today'),
        apiClient.get('/products/inventory/status'),
        apiClient.get('/customers')
      ]);
      setTasks(tasksRes.data);
      setInventory(invRes.data);
      setCustomers(custRes.data);
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleGenerateToday = async () => {
    try {
      setGenerating(true);
      const res = await apiClient.post('/deliveries/generate');
      alert(`Dispatch Generated: ${res.data.message}`);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.detail?.message || 'Failed to generate deliveries');
    } finally {
      setGenerating(false);
    }
  };

  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const pendingCount = tasks.filter(t => t.status === 'pending').length;
  const totalDues = customers.reduce((sum, c) => sum + (c.current_balance > 0 ? c.current_balance : 0), 0);
  const totalJarsWithCustomers = inventory.reduce((sum, i) => sum + i.with_customers, 0);
  const filledInWarehouse = inventory.reduce((sum, i) => sum + i.filled_warehouse, 0);

  // Delivery trend chart data
  const chartData = [
    { day: 'Mon', completed: 18, pending: 2 },
    { day: 'Tue', completed: 22, pending: 1 },
    { day: 'Wed', completed: 20, pending: 0 },
    { day: 'Thu', completed: 25, pending: 3 },
    { day: 'Fri', completed: 24, pending: 1 },
    { day: 'Sat', completed: 28, pending: 4 },
    { day: 'Today', completed: completedCount, pending: pendingCount },
  ];

  return (
    <div className="space-y-8">
      {/* Top Banner Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Plant Operations Dashboard</h1>
          <p className="text-xs text-slate-500">Live delivery dispatch, jar circulation, and accounts overview</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleGenerateToday}
            disabled={generating}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
            <span>{generating ? 'Generating Tasks...' : "Generate Today's Dispatch"}</span>
          </button>
          <Link
            to="/app/customers"
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-sm transition"
          >
            <PlusCircle className="w-3.5 h-3.5 text-brand-600" />
            <span>Add Customer</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center text-xs font-medium text-slate-500">
            <span>Today's Deliveries</span>
            <Truck className="w-4 h-4 text-brand-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            {completedCount} <span className="text-sm font-normal text-slate-400">/ {tasks.length} Done</span>
          </div>
          <div className="mt-2 flex items-center space-x-2 text-xs">
            <span className="text-emerald-600 font-semibold">{completedCount} Delivered</span>
            <span className="text-slate-300">•</span>
            <span className="text-amber-600 font-semibold">{pendingCount} Pending</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center text-xs font-medium text-slate-500">
            <span>Filled 20L Jars in Stock</span>
            <Package className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            {filledInWarehouse} <span className="text-sm font-normal text-slate-400">Jars</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">Ready at plant warehouse for loading</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center text-xs font-medium text-slate-500">
            <span>Jars With Customers</span>
            <Layers className="w-4 h-4 text-blue-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            {totalJarsWithCustomers} <span className="text-sm font-normal text-slate-400">Circulating</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">Active containers held by consumers</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center text-xs font-medium text-slate-500">
            <span>Customer Outstanding Dues</span>
            <IndianRupee className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            ₹{totalDues.toLocaleString('en-IN')}
          </div>
          <div className="mt-2 text-xs text-slate-500">Across {customers.length} registered accounts</div>
        </div>
      </div>

      {/* Main Operational Visuals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Delivery Activity Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Delivery Velocity & Fulfillment Trend</h3>
              <p className="text-xs text-slate-400">Daily jars successfully delivered vs pending</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                <Tooltip />
                <Bar dataKey="completed" name="Delivered" fill="#0284c7" radius={[4, 4, 0, 0]} />
                <Bar dataKey="pending" name="Pending" fill="#fbbf24" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Today's Top Stops */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-sm text-slate-900">Live Delivery Stops</h3>
              <Link to="/app/deliveries" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                View All
              </Link>
            </div>

            <div className="space-y-3">
              {tasks.slice(0, 5).map((t) => (
                <div key={t.id} className="p-3 border border-slate-100 rounded-xl hover:bg-slate-50 transition flex items-center justify-between">
                  <div className="truncate pr-2">
                    <div className="font-semibold text-xs text-slate-900 truncate">{t.customer_name}</div>
                    <div className="text-[11px] text-slate-500 truncate">{t.product_name} • {t.expected_qty} Jars</div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      t.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {t.status}
                  </span>
                </div>
              ))}
              {tasks.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-400">
                  No tasks generated yet. Click "Generate Today's Dispatch" to populate routes.
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 mt-4">
            <Link
              to="/delivery"
              target="_blank"
              className="w-full flex justify-center py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition"
            >
              Open Driver PWA Execution Interface
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

