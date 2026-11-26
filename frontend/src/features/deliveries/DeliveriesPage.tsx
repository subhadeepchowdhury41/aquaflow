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
  PackageCheck,
  Calendar,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Receipt,
  FileText,
  AlertCircle,
  Eye,
  X,
  CreditCard,
  Plus
} from 'lucide-react';

interface Task {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  delivery_instructions?: string;
  customer_balance?: number;
  product_id: string;
  product_name: string;
  product_price?: number;
  expected_qty: number;
  scheduled_date: string;
  shift: string;
  status: string;
  driver_id?: string;
  driver_name?: string;
  delivered_qty?: number;
  empty_collected_qty?: number;
  cash_collected?: number;
  payment_mode?: string;
  delivered_at?: string;
  delivery_notes?: string;
}

interface AvailableDriver {
  id: string;
  name: string;
  phone: string;
  is_current: boolean;
}

interface PaymentRecord {
  id: string;
  payment_number: string;
  amount: number;
  payment_method: string;
  payment_ref_id?: string;
  status: string;
  payment_date: string;
}

interface LedgerEntry {
  id: string;
  transaction_date: string;
  transaction_type: string;
  debit_amount: number;
  credit_amount: number;
  running_balance: number;
  notes?: string;
}

export const DeliveriesPage: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [drivers, setDrivers] = useState<AvailableDriver[]>([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Date selection state
  const getTodayStr = () => new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(getTodayStr());
  const [allDatesMode, setAllDatesMode] = useState<boolean>(false);

  // Reassignment loading state per task
  const [reassigningTaskId, setReassigningTaskId] = useState<string | null>(null);

  // Modals state
  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  const [historyModalTask, setHistoryModalTask] = useState<Task | null>(null);
  const [historyTab, setHistoryTab] = useState<'shipment' | 'payments' | 'ledger'>('shipment');

  // Shipment & Payment History data
  const [customerPayments, setCustomerPayments] = useState<PaymentRecord[]>([]);
  const [customerLedger, setCustomerLedger] = useState<LedgerEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Quick Payment form inside modal
  const [showQuickPay, setShowQuickPay] = useState(false);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<string>('cash');
  const [payNotes, setPayNotes] = useState<string>('');
  const [savingPayment, setSavingPayment] = useState(false);

  // Form for completing delivery directly as owner
  const [deliveredQty, setDeliveredQty] = useState(1);
  const [emptyCollectedQty, setEmptyCollectedQty] = useState(1);
  const [cashCollected, setCashCollected] = useState(0);
  const [notes, setNotes] = useState('');

  const loadDrivers = async () => {
    try {
      const res = await apiClient.get('/deliveries/available-drivers');
      setDrivers(res.data);
    } catch (err) {
      console.error('Failed to load drivers', err);
    }
  };

  const loadTasks = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (allDatesMode) {
        params.all_dates = true;
      } else {
        params.target_date = selectedDate;
      }
      const res = await apiClient.get('/deliveries/today', { params });
      setTasks(res.data);
    } catch (err) {
      console.error('Failed to load tasks', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDrivers();
  }, []);

  useEffect(() => {
    loadTasks();
  }, [selectedDate, allDatesMode]);

  // Date navigation helpers
  const handleDateShift = (days: number) => {
    setAllDatesMode(false);
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const setDateToToday = () => {
    setAllDatesMode(false);
    setSelectedDate(getTodayStr());
  };

  const setDateToTomorrow = () => {
    setAllDatesMode(false);
    const d = new Date();
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  // Reassign driver
  const handleReassignDriver = async (taskId: string, newDriverId: string) => {
    try {
      setReassigningTaskId(taskId);
      const res = await apiClient.post(`/deliveries/${taskId}/reassign`, {
        new_driver_id: newDriverId,
      });
      // Update local task state
      setTasks(prev => prev.map(t => {
        if (t.id === taskId) {
          return {
            ...t,
            driver_id: newDriverId,
            driver_name: res.data.new_driver_name || drivers.find(d => d.id === newDriverId)?.name
          };
        }
        return t;
      }));
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to reassign driver');
    } finally {
      setReassigningTaskId(null);
    }
  };

  // Open Shipment & Payment History Modal
  const openHistoryModal = async (task: Task) => {
    setHistoryModalTask(task);
    setHistoryTab('shipment');
    setShowQuickPay(false);
    setPayAmount(task.customer_balance && task.customer_balance > 0 ? task.customer_balance : 0);
    setLoadingHistory(true);
    try {
      const [paymentsRes, ledgerRes] = await Promise.all([
        apiClient.get('/invoices/payments', { params: { customer_id: task.customer_id } }),
        apiClient.get(`/customers/${task.customer_id}/ledger`)
      ]);
      setCustomerPayments(paymentsRes.data);
      setCustomerLedger(ledgerRes.data);
    } catch (err) {
      console.error('Failed to load customer payment/ledger history', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Record Quick Payment inside modal
  const handleRecordQuickPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!historyModalTask || payAmount <= 0) return;
    try {
      setSavingPayment(true);
      await apiClient.post('/invoices/payments', {
        customer_id: historyModalTask.customer_id,
        amount: payAmount,
        payment_method: payMethod,
        notes: payNotes || 'Owner collected payment'
      });
      // Refresh payments and ledger
      const [paymentsRes, ledgerRes] = await Promise.all([
        apiClient.get('/invoices/payments', { params: { customer_id: historyModalTask.customer_id } }),
        apiClient.get(`/customers/${historyModalTask.customer_id}/ledger`)
      ]);
      setCustomerPayments(paymentsRes.data);
      setCustomerLedger(ledgerRes.data);
      setShowQuickPay(false);
      setPayNotes('');
      // Refresh parent task list to update customer balance
      loadTasks();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to record payment');
    } finally {
      setSavingPayment(false);
    }
  };

  // Completion modal handlers
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
        delivery_status: deliveredQty === completingTask.expected_qty ? 'delivered' : 'partially_completed',
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
      t.customer_address?.toLowerCase().includes(search.toLowerCase()) ||
      t.driver_name?.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const isToday = selectedDate === getTodayStr() && !allDatesMode;
  const isTomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return selectedDate === d.toISOString().split('T')[0] && !allDatesMode;
  })();

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Delivery Dispatch & Shipment History</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200">
              {allDatesMode ? 'All Upcoming & Recorded Orders' : `${selectedDate}${isToday ? ' (Today)' : isTomorrow ? ' (Tomorrow)' : ''}`}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Assign drivers, view 2-jar orders & subscriptions, and inspect complete customer shipments and payment ledgers
          </p>
        </div>

        {/* Date Selector Navigation Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => handleDateShift(-1)}
              className="p-1.5 hover:bg-white rounded-lg text-slate-600 hover:text-slate-900 transition"
              title="Previous Day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={setDateToToday}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                isToday ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-700 hover:bg-white'
              }`}
            >
              Today
            </button>
            <button
              onClick={setDateToTomorrow}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                isTomorrow ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-700 hover:bg-white'
              }`}
            >
              Tomorrow
            </button>
            <button
              onClick={() => handleDateShift(1)}
              className="p-1.5 hover:bg-white rounded-lg text-slate-600 hover:text-slate-900 transition"
              title="Next Day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Date Picker Input */}
          <div className="flex items-center bg-white border border-slate-200 rounded-xl px-2 py-1 space-x-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setAllDatesMode(false);
                setSelectedDate(e.target.value);
              }}
              className="text-xs font-medium text-slate-800 bg-transparent focus:outline-none cursor-pointer"
            />
          </div>

          {/* All Dates toggle */}
          <button
            onClick={() => setAllDatesMode(!allDatesMode)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
              allDatesMode
                ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {allDatesMode ? 'Viewing All Dates' : 'View All Dates'}
          </button>

          <button
            onClick={loadTasks}
            className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition"
            title="Refresh Orders"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex space-x-1 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {['all', 'pending', 'completed', 'partially_completed', 'failed'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize whitespace-nowrap transition ${
                filter === f
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {f.replace('_', ' ')} ({tasks.filter(t => f === 'all' ? true : t.status === f).length})
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, phone, driver, address..."
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-brand-500"
          />
        </div>
      </div>

      {/* Orders & Deliveries Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-4">Customer Details</th>
                <th className="p-4">Delivery Address</th>
                <th className="p-4">Product & Shift</th>
                <th className="p-4">Qty</th>
                <th className="p-4">Assigned Driver</th>
                <th className="p-4">Status & Shipment</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredTasks.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/70 transition">
                  {/* Customer */}
                  <td className="p-4">
                    <div className="font-bold text-slate-900 text-sm">{t.customer_name}</div>
                    <div className="text-slate-500 flex items-center space-x-1 mt-0.5">
                      <Phone className="w-3 h-3 text-slate-400" />
                      <span>{t.customer_phone}</span>
                    </div>
                    {t.customer_balance !== undefined && (
                      <div className="mt-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          t.customer_balance > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          Due: ₹{t.customer_balance}
                        </span>
                      </div>
                    )}
                  </td>

                  {/* Address */}
                  <td className="p-4 max-w-xs">
                    <div className="flex items-start space-x-1.5 text-slate-600">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{t.customer_address}</span>
                    </div>
                    {t.delivery_instructions && (
                      <div className="text-[10px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 mt-1 border border-amber-200/50 inline-block">
                        Note: {t.delivery_instructions}
                      </div>
                    )}
                  </td>

                  {/* Product & Shift */}
                  <td className="p-4">
                    <div className="font-semibold text-slate-900">{t.product_name}</div>
                    <div className="text-[11px] text-slate-500 capitalize flex items-center space-x-1 mt-0.5">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{t.shift} Shift • {t.scheduled_date}</span>
                    </div>
                  </td>

                  {/* Quantity */}
                  <td className="p-4">
                    <div className="font-mono font-bold text-base text-slate-900">
                      {t.expected_qty} <span className="text-xs font-medium text-slate-500">Jars</span>
                    </div>
                    {t.delivered_qty !== undefined && t.delivered_qty !== null && (
                      <div className="text-[11px] font-medium text-emerald-600">
                        Delivered: {t.delivered_qty}
                      </div>
                    )}
                  </td>

                  {/* Assigned Driver Selector */}
                  <td className="p-4">
                    <div className="flex items-center space-x-1.5">
                      <select
                        value={t.driver_id || ''}
                        disabled={reassigningTaskId === t.id}
                        onChange={(e) => handleReassignDriver(t.id, e.target.value)}
                        className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border focus:outline-none transition ${
                          t.driver_id
                            ? 'bg-blue-50/70 border-blue-200 text-blue-900'
                            : 'bg-amber-50 border-amber-200 text-amber-800'
                        }`}
                      >
                        <option value="" disabled>-- Assign Driver --</option>
                        {drivers.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name} {d.phone ? `(${d.phone})` : ''}
                          </option>
                        ))}
                      </select>
                      {reassigningTaskId === t.id && (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
                      )}
                    </div>
                  </td>

                  {/* Status & Shipment Record */}
                  <td className="p-4">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        t.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : t.status === 'partially_completed'
                          ? 'bg-orange-100 text-orange-800'
                          : t.status === 'pending'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {t.status.replace('_', ' ')}
                    </span>
                    {t.cash_collected && t.cash_collected > 0 ? (
                      <div className="text-[10px] text-emerald-700 font-bold mt-1">
                        ₹{t.cash_collected} collected ({t.payment_mode})
                      </div>
                    ) : null}
                  </td>

                  {/* Actions */}
                  <td className="p-4 text-right space-x-2">
                    <button
                      onClick={() => openHistoryModal(t)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition inline-flex items-center space-x-1"
                      title="View Order Shipment & Payment History"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-500" />
                      <span>History</span>
                    </button>

                    {t.status === 'pending' && (
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
                    )}
                  </td>
                </tr>
              ))}
              {filteredTasks.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400 text-xs">
                    <Truck className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    No delivery tasks matching {allDatesMode ? 'all dates' : selectedDate}.
                    {!allDatesMode && (
                      <div className="mt-2">
                        <button
                          onClick={setDateToTomorrow}
                          className="text-brand-600 font-bold hover:underline"
                        >
                          Check Tomorrow's Orders &rarr;
                        </button>
                        {' or '}
                        <button
                          onClick={() => setAllDatesMode(true)}
                          className="text-purple-600 font-bold hover:underline"
                        >
                          View All Dates
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Shipment & Payment History Modal */}
      {historyModalTask && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex justify-between items-start pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-bold text-lg text-slate-900">
                    {historyModalTask.customer_name}
                  </h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    historyModalTask.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-800'
                      : historyModalTask.status === 'pending'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-700'
                  }`}>
                    {historyModalTask.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Order: {historyModalTask.expected_qty}x {historyModalTask.product_name} • Scheduled: {historyModalTask.scheduled_date} ({historyModalTask.shift} shift)
                </p>
                <div className="text-xs text-slate-500 mt-0.5 flex items-center space-x-1">
                  <Phone className="w-3 h-3 text-slate-400" />
                  <span>{historyModalTask.customer_phone}</span>
                  <span className="mx-1">•</span>
                  <MapPin className="w-3 h-3 text-slate-400" />
                  <span className="truncate max-w-sm">{historyModalTask.customer_address}</span>
                </div>
              </div>

              <button
                onClick={() => setHistoryModalTask(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex space-x-2 pt-3 border-b border-slate-100">
              <button
                onClick={() => setHistoryTab('shipment')}
                className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition flex items-center space-x-1.5 ${
                  historyTab === 'shipment'
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                <span>Order Shipment Details</span>
              </button>
              <button
                onClick={() => setHistoryTab('payments')}
                className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition flex items-center space-x-1.5 ${
                  historyTab === 'payments'
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Payment Receipts ({customerPayments.length})</span>
              </button>
              <button
                onClick={() => setHistoryTab('ledger')}
                className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition flex items-center space-x-1.5 ${
                  historyTab === 'ledger'
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Customer Ledger ({customerLedger.length})</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto flex-1 py-4">
              {loadingHistory ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-brand-600" />
                  Loading shipment and financial records...
                </div>
              ) : historyTab === 'shipment' ? (
                /* TAB 1: SHIPMENT DETAILS */
                <div className="space-y-4">
                  {/* Fulfillment Stats Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                      <div className="text-[11px] text-slate-500 font-medium">Expected Jars</div>
                      <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                        {historyModalTask.expected_qty}
                      </div>
                    </div>
                    <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200/80">
                      <div className="text-[11px] text-emerald-700 font-medium">Delivered Jars</div>
                      <div className="text-xl font-bold font-mono text-emerald-800 mt-0.5">
                        {historyModalTask.delivered_qty ?? (historyModalTask.status === 'completed' ? historyModalTask.expected_qty : '—')}
                      </div>
                    </div>
                    <div className="bg-blue-50 p-3 rounded-xl border border-blue-200/80">
                      <div className="text-[11px] text-blue-700 font-medium">Empty Collected</div>
                      <div className="text-xl font-bold font-mono text-blue-800 mt-0.5">
                        {historyModalTask.empty_collected_qty ?? '—'}
                      </div>
                    </div>
                    <div className="bg-amber-50 p-3 rounded-xl border border-amber-200/80">
                      <div className="text-[11px] text-amber-700 font-medium">Doorstep Cash</div>
                      <div className="text-xl font-bold font-mono text-amber-800 mt-0.5">
                        ₹{historyModalTask.cash_collected ?? 0}
                      </div>
                    </div>
                  </div>

                  {/* Delivery Execution Information */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Fulfillment Record
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-slate-400">Assigned Driver:</span>
                        <div className="font-semibold text-slate-800 mt-0.5">
                          {historyModalTask.driver_name || 'Unassigned'}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400">Delivered Timestamp:</span>
                        <div className="font-semibold text-slate-800 mt-0.5">
                          {historyModalTask.delivered_at
                            ? new Date(historyModalTask.delivered_at).toLocaleString()
                            : historyModalTask.status === 'completed'
                            ? `${historyModalTask.scheduled_date} (Logged)`
                            : 'Pending delivery'}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400">Payment Collection Mode:</span>
                        <div className="font-semibold text-slate-800 mt-0.5 capitalize">
                          {historyModalTask.payment_mode || 'Unpaid / Monthly Ledger'}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400">Driver Remarks / Notes:</span>
                        <div className="font-semibold text-slate-800 mt-0.5">
                          {historyModalTask.delivery_notes || 'No remarks submitted'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Customer Delivery Instructions */}
                  {historyModalTask.delivery_instructions && (
                    <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
                      <span className="font-bold">Customer Standing Instructions: </span>
                      {historyModalTask.delivery_instructions}
                    </div>
                  )}
                </div>
              ) : historyTab === 'payments' ? (
                /* TAB 2: PAYMENT RECEIPTS */
                <div className="space-y-4">
                  {/* Customer Balance Banner */}
                  <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                    <div>
                      <div className="text-xs text-slate-500">Outstanding Balance</div>
                      <div className="text-xl font-bold font-mono text-slate-900">
                        ₹{historyModalTask.customer_balance || 0}
                      </div>
                    </div>
                    <button
                      onClick={() => setShowQuickPay(!showQuickPay)}
                      className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Record Payment</span>
                    </button>
                  </div>

                  {/* Quick Payment Form */}
                  {showQuickPay && (
                    <form onSubmit={handleRecordQuickPayment} className="bg-brand-50/60 border border-brand-200 rounded-xl p-4 space-y-3">
                      <h4 className="text-xs font-bold text-brand-900">Record Received Payment</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Amount (₹)</label>
                          <input
                            type="number"
                            min="1"
                            step="0.01"
                            required
                            value={payAmount}
                            onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-1.5 border rounded-lg text-xs font-semibold"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Payment Method</label>
                          <select
                            value={payMethod}
                            onChange={(e) => setPayMethod(e.target.value)}
                            className="w-full px-3 py-1.5 border rounded-lg text-xs font-semibold bg-white"
                          >
                            <option value="cash">Cash</option>
                            <option value="upi">UPI / GPay / PhonePe</option>
                            <option value="bank_transfer">Bank Transfer</option>
                            <option value="cheque">Cheque</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Notes / Ref ID</label>
                        <input
                          type="text"
                          value={payNotes}
                          onChange={(e) => setPayNotes(e.target.value)}
                          placeholder="e.g. UPI Ref #40291039, or Handed to owner"
                          className="w-full px-3 py-1.5 border rounded-lg text-xs"
                        />
                      </div>
                      <div className="flex justify-end space-x-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowQuickPay(false)}
                          className="px-3 py-1 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={savingPayment}
                          className="px-4 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition"
                        >
                          {savingPayment ? 'Saving...' : 'Save Payment'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Payment List */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                        <tr>
                          <th className="p-3">Receipt #</th>
                          <th className="p-3">Date</th>
                          <th className="p-3">Amount</th>
                          <th className="p-3">Method</th>
                          <th className="p-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {customerPayments.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50/60">
                            <td className="p-3 font-mono font-bold text-slate-900">{p.payment_number}</td>
                            <td className="p-3 text-slate-600">{new Date(p.payment_date).toLocaleDateString()}</td>
                            <td className="p-3 font-mono font-bold text-emerald-700">₹{p.amount}</td>
                            <td className="p-3 uppercase text-[11px] font-medium text-slate-600">{p.payment_method}</td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-bold">
                                {p.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {customerPayments.length === 0 && (
                          <tr>
                            <td colSpan={5} className="p-6 text-center text-slate-400 text-xs">
                              No payment receipts recorded for this customer yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* TAB 3: CUSTOMER LEDGER */
                <div className="space-y-4">
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                        <tr>
                          <th className="p-3">Date</th>
                          <th className="p-3">Description</th>
                          <th className="p-3 text-right">Debit (Charges)</th>
                          <th className="p-3 text-right">Credit (Paid)</th>
                          <th className="p-3 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {customerLedger.map((e) => (
                          <tr key={e.id} className="hover:bg-slate-50/60">
                            <td className="p-3 text-slate-600 font-sans">
                              {new Date(e.transaction_date).toLocaleDateString()}
                            </td>
                            <td className="p-3 font-sans">
                              <div className="font-semibold text-slate-800 capitalize">
                                {e.transaction_type.replace('_', ' ')}
                              </div>
                              {e.notes && <div className="text-[10px] text-slate-400">{e.notes}</div>}
                            </td>
                            <td className="p-3 text-right text-rose-700 font-bold">
                              {e.debit_amount > 0 ? `₹${e.debit_amount}` : '—'}
                            </td>
                            <td className="p-3 text-right text-emerald-700 font-bold">
                              {e.credit_amount > 0 ? `₹${e.credit_amount}` : '—'}
                            </td>
                            <td className="p-3 text-right font-bold text-slate-900">
                              ₹{e.running_balance}
                            </td>
                          </tr>
                        ))}
                        {customerLedger.length === 0 && (
                          <tr>
                            <td colSpan={5} className="p-6 text-center text-slate-400 text-xs font-sans">
                              No ledger entries recorded yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setHistoryModalTask(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Delivery Completion Modal */}
      {completingTask && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <h3 className="font-bold text-base text-slate-900 mb-1">
              Record Delivery: {completingTask.customer_name}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {completingTask.product_name} • Scheduled: {completingTask.expected_qty} Jars
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
