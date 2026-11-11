import React, { useState, useEffect } from 'react';
import { apiClient } from '@/api/client';
import { 
  Truck, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Search, 
  RefreshCw, 
  MapPin, 
  Phone,
  IndianRupee,
  PackageCheck
} from 'lucide-react';

interface Task {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  product_name: string;
  expected_qty: number;
  shift: string;
  status: string;
}

export const DeliveriesPage: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [completingTask, setCompletingTask] = useState<Task | null>(null);

  // Form for completing delivery
  const [deliveredQty, setDeliveredQty] = useState(1);
  const [emptyCollectedQty, setEmptyCollectedQty] = useState(1);
  const [cashCollected, setCashCollected] = useState(0);
  const [notes, setNotes] = useState('');

  const loadTasks = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/deliveries/today');
      setTasks(res.data);
    } catch (err) {
      console.error('Failed to load tasks', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const openCompletionModal = (task: Task) => {
    setCompletingTask(task);
    setDeliveredQty(task.expected_qty);
    setEmptyCollectedQty(task.expected_qty);
    setCashCollected(0);
    setNotes('');
  };

  const handleRecordDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingTask) return;

    try {
      await apiClient.post('/deliveries/record', {
        delivery_task_id: completingTask.id,
        delivered_qty: deliveredQty,
        empty_collected_qty: emptyCollectedQty,
        cash_collected: cashCollected,
        payment_mode: cashCollected > 0 ? 'cash' : 'unpaid',
        delivery_status: 'delivered',
        notes: notes,
      });
      setCompletingTask(null);
      await loadTasks();
    } catch (err: any) {
      alert(err.response?.data?.detail?.message || err.response?.data?.detail || 'Failed to complete delivery');
    }
  };

  const handleMarkFailed = async (task: Task) => {
    const reason = prompt('Reason for delivery failure (e.g. Customer door locked, out of station):');
    if (!reason) return;

    try {
      await apiClient.post('/deliveries/record', {
        delivery_task_id: task.id,
        delivered_qty: 0,
        empty_collected_qty: 0,
        cash_collected: 0,
        delivery_status: 'failed',
        failure_reason: reason,
      });
      await loadTasks();
    } catch (err: any) {
      alert('Failed to mark task as failed');
    }
  };

  const filteredTasks = tasks.filter((t) => {
    const matchesFilter = filter === 'all' || t.status === filter;
    const matchesSearch =
      t.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      t.customer_phone?.includes(search) ||
      t.customer_address?.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Today's Delivery Dispatch Sheet</h1>
          <p className="text-xs text-slate-500">Assign drivers, monitor drop-offs, and track returnable containers</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={loadTasks}
            className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex space-x-1 w-full sm:w-auto">
          {['all', 'pending', 'completed', 'failed'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                filter === f
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {f} ({tasks.filter(t => f === 'all' ? true : t.status === f).length})
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stops, phone number..."
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-brand-500"
          />
        </div>
      </div>

      {/* Tasks Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-4">Customer Details</th>
                <th className="p-4">Delivery Address</th>
                <th className="p-4">Product & Shift</th>
                <th className="p-4">Qty</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredTasks.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/60 transition">
                  <td className="p-4">
                    <div className="font-semibold text-slate-900">{t.customer_name}</div>
                    <div className="text-slate-500 flex items-center space-x-1 mt-0.5">
                      <Phone className="w-3 h-3" />
                      <span>{t.customer_phone}</span>
                    </div>
                  </td>
                  <td className="p-4 max-w-xs truncate">
                    <div className="flex items-center space-x-1 text-slate-600">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span className="truncate">{t.customer_address}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="font-medium text-slate-900">{t.product_name}</div>
                    <div className="text-[11px] text-slate-500 capitalize">{t.shift} Shift</div>
                  </td>
                  <td className="p-4 font-mono font-bold text-slate-900">
                    {t.expected_qty} Jars
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        t.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-700'
                          : t.status === 'pending'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    {t.status === 'pending' ? (
                      <>
                        <button
                          onClick={() => openCompletionModal(t)}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition inline-flex items-center space-x-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Deliver</span>
                        </button>
                        <button
                          onClick={() => handleMarkFailed(t)}
                          className="px-2 py-1.5 border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-600 rounded-lg text-xs font-semibold transition"
                          title="Mark Failed"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <span className="text-slate-400 text-xs italic">Logged</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredTasks.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 text-xs">
                    No delivery tasks matching current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Delivery Completion Modal */}
      {completingTask && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <h3 className="font-bold text-base text-slate-900 mb-1">
              Record Delivery: {completingTask.customer_name}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {completingTask.product_name} • Address: {completingTask.customer_address}
            </p>

            <form onSubmit={handleRecordDelivery} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Delivered Filled Jars</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={deliveredQty}
                    onChange={(e) => setDeliveredQty(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border rounded-lg text-sm font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Empty Jars Collected</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={emptyCollectedQty}
                    onChange={(e) => setEmptyCollectedQty(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border rounded-lg text-sm font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Cash Collected at Doorstep (₹ COD)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 text-sm font-bold">₹</span>
                  <input
                    type="number"
                    min="0"
                    value={cashCollected}
                    onChange={(e) => setCashCollected(parseFloat(e.target.value) || 0)}
                    className="w-full pl-8 pr-3 py-2 border rounded-lg text-sm font-semibold"
                    placeholder="0.00"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Leave 0 if postpaid billing ledger applies.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Delivery Remarks</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="e.g. Left with guard, payment via GPay"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setCompletingTask(null)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                >
                  Save & Confirm Stop
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

