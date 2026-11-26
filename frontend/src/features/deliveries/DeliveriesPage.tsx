import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  Calendar,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Eye,
  X,
  Plus,
  Trash2,
  UserCheck,
  AlertCircle,
  Ban,
  Package
} from 'lucide-react';

interface ShipmentSummary {
  id: string;
  shipment_number: string;
  order_id: string;
  driver_id?: string;
  driver_name?: string;
  driver_phone?: string;
  scheduled_date: string;
  shift: string;
  assigned_qty: number;
  delivered_qty: number;
  empty_collected_qty: number;
  amount_to_collect: number;
  cash_collected: number;
  payment_mode: string;
  status: string;
  delivered_at?: string;
  notes?: string;
  failure_reason?: string;
  created_at: string;
}

interface OrderPayment {
  id: string;
  payment_number: string;
  amount: number;
  payment_method: string;
  payment_ref_id?: string;
  payment_stage: string;
  status: string;
  payment_date: string;
  notes?: string;
  shipment_id?: string;
  collector_name?: string;
}

interface OrderTask {
  id: string;
  order_number?: string;
  source?: string;
  rejection_reason?: string;
  notes?: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  delivery_instructions?: string;
  product_id: string;
  product_name: string;
  unit_price?: number;
  total_amount: number;
  paid_amount: number;
  unpaid_amount: number;
  invoice_id?: string;
  invoice_number?: string;
  expected_qty: number;
  assigned_qty_total: number;
  delivered_qty_total: number;
  remaining_assignable_qty: number;
  scheduled_date: string;
  shift: string;
  status: string;
  shipments: ShipmentSummary[];
  payments: OrderPayment[];
}

interface AvailableDriver {
  id: string;
  name: string;
  phone: string;
}

interface CustomerOption {
  id: string;
  name: string;
  phone: string;
  customer_code: string;
}

interface ProductOption {
  id: string;
  name: string;
  selling_price: number;
  gst_rate: number;
  unit: string;
}

interface InitialShipmentRow {
  driver_id: string;
  assigned_qty: number;
  amount_to_collect: string;
  notes: string;
}

const STATUS_BADGE: Record<string, string> = {
  requested: 'bg-indigo-100 text-indigo-800 border border-indigo-200',
  pending: 'bg-amber-100 text-amber-800',
  assigned: 'bg-sky-100 text-sky-800',
  in_transit: 'bg-blue-100 text-blue-800',
  partially_completed: 'bg-orange-100 text-orange-800',
  completed: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-rose-100 text-rose-800',
  failed: 'bg-rose-100 text-rose-800',
  cancelled: 'bg-slate-100 text-slate-600',
};

const STAGE_LABEL: Record<string, { label: string; cls: string }> = {
  while_order: { label: 'While Ordering', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  while_delivery: { label: 'While Delivery', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  later: { label: 'Later Collection', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
};

export const DeliveriesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState<OrderTask[]>([]);
  const [requestedCountAllDates, setRequestedCountAllDates] = useState(0);
  const [drivers, setDrivers] = useState<AvailableDriver[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);

  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const getTodayStr = () => new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(getTodayStr());
  const [allDatesMode, setAllDatesMode] = useState<boolean>(false);

  // Assign Shipment Modal
  const [assignModalOrder, setAssignModalOrder] = useState<OrderTask | null>(null);
  const [assignDriverId, setAssignDriverId] = useState<string>('');
  const [assignQty, setAssignQty] = useState<number>(1);
  const [assignCollectAmount, setAssignCollectAmount] = useState<number>(0);
  const [assignNotes, setAssignNotes] = useState<string>('');
  const [submittingAssign, setSubmittingAssign] = useState(false);

  // Reject Order Modal
  const [rejectModalOrder, setRejectModalOrder] = useState<OrderTask | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [submittingReject, setSubmittingReject] = useState(false);

  // Order History Modal (Shipments tab + Payments tab — NO ledger)
  const [historyModalOrder, setHistoryModalOrder] = useState<OrderTask | null>(null);
  const [historyTab, setHistoryTab] = useState<'shipments' | 'payments'>('shipments');

  // Quick Record Payment inside Order History -> Payments Tab
  const [showQuickPay, setShowQuickPay] = useState(false);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<string>('cash');
  const [payRefId, setPayRefId] = useState<string>('');
  const [payNotes, setPayNotes] = useState<string>('');
  const [savingPayment, setSavingPayment] = useState(false);

  // Create Order Modal (Owner)
  const [isCreateOrderOpen, setIsCreateOrderOpen] = useState(false);
  const [newCustomerId, setNewCustomerId] = useState('');
  const [newProductId, setNewProductId] = useState('');
  const [newQty, setNewQty] = useState(2);
  const [newScheduledDate, setNewScheduledDate] = useState(getTodayStr());
  const [newShift, setNewShift] = useState('morning');
  const [newNotes, setNewNotes] = useState('');
  const [upfrontPayAmount, setUpfrontPayAmount] = useState(0);
  const [upfrontPayMethod, setUpfrontPayMethod] = useState('cash');
  const [upfrontPayRef, setUpfrontPayRef] = useState('');
  const [initialShipments, setInitialShipments] = useState<InitialShipmentRow[]>([]);
  const [creatingOrder, setCreatingOrder] = useState(false);

  const loadMetadata = async () => {
    try {
      const [drvRes, custRes, prodRes] = await Promise.all([
        apiClient.get('/deliveries/available-drivers'),
        apiClient.get('/customers'),
        apiClient.get('/products'),
      ]);
      setDrivers(drvRes.data);
      setCustomers(custRes.data);
      setProducts(prodRes.data);
      if (drvRes.data.length > 0 && !assignDriverId) setAssignDriverId(drvRes.data[0].id);
      if (custRes.data.length > 0 && !newCustomerId) setNewCustomerId(custRes.data[0].id);
      if (prodRes.data.length > 0 && !newProductId) setNewProductId(prodRes.data[0].id);
    } catch (err) {
      console.error('Failed to load metadata', err);
    }
  };

  const loadTasks = async () => {
    try {
      setLoading(true);
      const params: Record<string, any> = allDatesMode ? { all_dates: true } : { target_date: selectedDate };
      const [res, reqRes] = await Promise.all([
        apiClient.get('/deliveries/today', { params }),
        apiClient.get('/deliveries/today', { params: { all_dates: true, status_filter: 'requested' } }),
      ]);
      setTasks(res.data);
      setRequestedCountAllDates(Array.isArray(reqRes.data) ? reqRes.data.length : 0);
    } catch (err) {
      console.error('Failed to load orders', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshOrderInHistory = async (orderId: string) => {
    try {
      const res = await apiClient.get(`/deliveries/orders/${orderId}`);
      setHistoryModalOrder(res.data);
    } catch (err) {
      console.error('Failed to refresh order history modal', err);
    }
  };

  useEffect(() => {
    loadMetadata();
  }, []);

  useEffect(() => {
    loadTasks();
  }, [selectedDate, allDatesMode]);

  // Open linked order when navigated from Universal Payments (?orderId=...)
  useEffect(() => {
    const linkedOrderId = searchParams.get('orderId');
    if (linkedOrderId) {
      apiClient
        .get(`/deliveries/orders/${linkedOrderId}`)
        .then((res) => {
          setHistoryModalOrder(res.data);
          setHistoryTab('shipments');
          setPayAmount(res.data.unpaid_amount || 0);
          setAllDatesMode(true);
        })
        .catch((err) => console.error('Failed to open linked order', err));
    }
  }, [searchParams]);

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

  // Open Assign Shipment modal
  const openAssignModal = (order: OrderTask) => {
    const qty = Math.max(1, order.remaining_assignable_qty || order.expected_qty);
    const plannedAlready = order.shipments
      .filter((s) => s.status === 'assigned' || s.status === 'in_transit')
      .reduce((sum, s) => sum + s.amount_to_collect, 0);
    const unpaidLeft = Math.max(0, (order.unpaid_amount || 0) - plannedAlready);
    const proportional = Number(((qty / Math.max(1, order.expected_qty)) * (order.total_amount || 0)).toFixed(2));
    const defaultCollect = Math.min(unpaidLeft, proportional);

    setAssignModalOrder(order);
    if (!assignDriverId && drivers.length > 0) setAssignDriverId(drivers[0].id);
    setAssignQty(qty);
    setAssignCollectAmount(Number(defaultCollect.toFixed(2)));
    setAssignNotes('');
  };

  const handleAssignQtyChange = (val: number) => {
    if (!assignModalOrder) return;
    const clamped = Math.max(1, Math.min(assignModalOrder.remaining_assignable_qty || assignModalOrder.expected_qty, val));
    setAssignQty(clamped);
    const plannedAlready = assignModalOrder.shipments
      .filter((s) => s.status === 'assigned' || s.status === 'in_transit')
      .reduce((sum, s) => sum + s.amount_to_collect, 0);
    const unpaidLeft = Math.max(0, (assignModalOrder.unpaid_amount || 0) - plannedAlready);
    const proportional = Number(((clamped / Math.max(1, assignModalOrder.expected_qty)) * (assignModalOrder.total_amount || 0)).toFixed(2));
    setAssignCollectAmount(Number(Math.min(unpaidLeft, proportional).toFixed(2)));
  };

  const handleAssignShipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignModalOrder || !assignDriverId) return;
    try {
      setSubmittingAssign(true);
      await apiClient.post(`/deliveries/${assignModalOrder.id}/shipments`, {
        driver_id: assignDriverId,
        assigned_qty: assignQty,
        amount_to_collect: assignCollectAmount,
        notes: assignNotes || undefined,
      });
      const updatedId = assignModalOrder.id;
      setAssignModalOrder(null);
      await loadTasks();
      if (historyModalOrder?.id === updatedId) {
        await refreshOrderInHistory(updatedId);
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || err.response?.data?.error || 'Failed to assign shipment');
    } finally {
      setSubmittingAssign(false);
    }
  };

  const handleRejectOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalOrder) return;
    try {
      setSubmittingReject(true);
      await apiClient.post(`/deliveries/${rejectModalOrder.id}/reject`, {
        reason: rejectReason || 'Rejected by business owner',
      });
      setRejectModalOrder(null);
      setRejectReason('');
      await loadTasks();
    } catch (err: any) {
      alert(err.response?.data?.detail || err.response?.data?.error || 'Failed to reject order');
    } finally {
      setSubmittingReject(false);
    }
  };

  // Open History modal (Shipments & Order Payments only — no ledger)
  const openHistoryModal = async (order: OrderTask) => {
    setHistoryModalOrder(order);
    setHistoryTab('shipments');
    setShowQuickPay(false);
    setPayAmount(order.unpaid_amount || 0);
    setPayRefId('');
    setPayNotes('');
    await refreshOrderInHistory(order.id);
  };

  const closeHistoryModal = () => {
    setHistoryModalOrder(null);
    if (searchParams.has('orderId')) {
      searchParams.delete('orderId');
      setSearchParams(searchParams, { replace: true });
    }
  };

  const handleRecordOrderPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!historyModalOrder || payAmount <= 0) return;
    try {
      setSavingPayment(true);
      await apiClient.post('/invoices/payments', {
        customer_id: historyModalOrder.customer_id,
        order_id: historyModalOrder.id,
        invoice_id: historyModalOrder.invoice_id || undefined,
        payment_stage: 'later',
        amount: payAmount,
        payment_method: payMethod,
        payment_ref_id: payRefId || undefined,
        notes: payNotes || `Payment recorded for ${historyModalOrder.order_number || 'order'}`,
      });
      setShowQuickPay(false);
      setPayRefId('');
      setPayNotes('');
      await Promise.all([refreshOrderInHistory(historyModalOrder.id), loadTasks()]);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to record order payment');
    } finally {
      setSavingPayment(false);
    }
  };

  // Owner Create Order helpers
  const selectedProdObj = products.find((p) => p.id === newProductId);
  const estimatedOrderTotal = selectedProdObj
    ? Number((selectedProdObj.selling_price * newQty * (1 + (selectedProdObj.gst_rate || 0) / 100)).toFixed(2))
    : 0;

  const totalInitialShippedQty = initialShipments.reduce((s, r) => s + (r.assigned_qty || 0), 0);

  const addInitialShipmentRow = () => {
    const remaining = Math.max(1, newQty - totalInitialShippedQty);
    const defaultDriver = drivers[0]?.id || '';
    const unpaidEst = Math.max(0, estimatedOrderTotal - upfrontPayAmount);
    setInitialShipments([
      ...initialShipments,
      {
        driver_id: defaultDriver,
        assigned_qty: remaining,
        amount_to_collect: unpaidEst.toFixed(2),
        notes: '',
      },
    ]);
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerId || !newProductId || newQty <= 0) return;
    if (totalInitialShippedQty > newQty) {
      alert(`Assigned shipment quantity (${totalInitialShippedQty}) exceeds order quantity (${newQty}).`);
      return;
    }

    try {
      setCreatingOrder(true);
      await apiClient.post('/deliveries/orders', {
        customer_id: newCustomerId,
        product_id: newProductId,
        expected_qty: newQty,
        scheduled_date: newScheduledDate,
        shift: newShift,
        notes: newNotes || undefined,
        initial_payment_amount: upfrontPayAmount || 0,
        initial_payment_method: upfrontPayMethod,
        initial_payment_ref: upfrontPayRef || undefined,
        shipments: initialShipments
          .filter((r) => r.driver_id && r.assigned_qty > 0)
          .map((r) => ({
            driver_id: r.driver_id,
            assigned_qty: r.assigned_qty,
            amount_to_collect: parseFloat(r.amount_to_collect) || 0,
            notes: r.notes || undefined,
          })),
      });
      setIsCreateOrderOpen(false);
      setNewNotes('');
      setUpfrontPayAmount(0);
      setUpfrontPayRef('');
      setInitialShipments([]);
      setSelectedDate(newScheduledDate);
      setAllDatesMode(false);
      await loadTasks();
    } catch (err: any) {
      alert(err.response?.data?.detail || err.response?.data?.error || 'Failed to create order');
    } finally {
      setCreatingOrder(false);
    }
  };

  const filteredTasks = tasks.filter((t) => {
    const matchesFilter = filter === 'all' || t.status === filter;
    const q = search.toLowerCase();
    const matchesSearch =
      t.customer_name?.toLowerCase().includes(q) ||
      t.customer_phone?.includes(search) ||
      t.customer_address?.toLowerCase().includes(q) ||
      t.order_number?.toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });

  const isToday = selectedDate === getTodayStr() && !allDatesMode;
  const isTomorrow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return selectedDate === d.toISOString().split('T')[0] && !allDatesMode;
  })();

  const statusTabs = ['all', 'requested', 'pending', 'assigned', 'partially_completed', 'completed', 'rejected', 'failed'];

  return (
    <div className="space-y-5">
      {/* Pending Customer Requests Alert Banner */}
      {requestedCountAllDates > 0 && (
        <div className="bg-indigo-600 text-white px-5 py-3 rounded-2xl shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center space-x-2.5 text-xs">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-indigo-200" />
            <span>
              <strong>{requestedCountAllDates} New Customer Order Request{requestedCountAllDates > 1 ? 's' : ''}</strong> awaiting your approval &amp; shipment assignment.
            </span>
          </div>
          <button
            onClick={() => {
              setAllDatesMode(true);
              setFilter('requested');
            }}
            className="px-3.5 py-1.5 bg-white text-indigo-700 rounded-xl text-xs font-extrabold hover:bg-indigo-50 transition shadow-sm"
          >
            Review Requests &rarr;
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Orders &amp; Delivery Shipments</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200">
              {allDatesMode ? 'All Dates' : `${selectedDate}${isToday ? ' (Today)' : isTomorrow ? ' (Tomorrow)' : ''}`}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Review customer requests, create orders, split deliveries into driver shipments, and track per-order invoices &amp; payments
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsCreateOrderOpen(true)}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Create Order</span>
          </button>

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
          {statusTabs.map((f) => {
            const count = tasks.filter((t) => (f === 'all' ? true : t.status === f)).length;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize whitespace-nowrap transition ${
                  filter === f
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {f.replace('_', ' ')} ({count})
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, customer, phone, address..."
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-brand-500"
          />
        </div>
      </div>

      {/* Orders Table (NO Assigned Driver column as requested) */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-4">Order &amp; Customer</th>
                <th className="p-4">Product &amp; Schedule</th>
                <th className="p-4">Qty &amp; Shipments</th>
                <th className="p-4">Order Payment</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredTasks.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/70 transition">
                  {/* Order & Customer */}
                  <td className="p-4">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-[11px] bg-slate-100 text-slate-800 px-2 py-0.5 rounded">
                        {t.order_number || `ORD-${t.id.slice(0, 6).toUpperCase()}`}
                      </span>
                      <span className="font-bold text-slate-900 text-sm">{t.customer_name}</span>
                    </div>
                    <div className="text-slate-500 flex items-center space-x-2 mt-1">
                      <span className="flex items-center space-x-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{t.customer_phone}</span>
                      </span>
                      <span>•</span>
                      <span className="flex items-center space-x-1 truncate max-w-[220px]">
                        <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
                        <span className="truncate">{t.customer_address}</span>
                      </span>
                    </div>
                  </td>

                  {/* Product & Schedule */}
                  <td className="p-4">
                    <div className="font-semibold text-slate-900">{t.product_name}</div>
                    <div className="text-[11px] text-slate-500 capitalize flex items-center space-x-1 mt-0.5">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{t.scheduled_date} • {t.shift} Shift</span>
                    </div>
                    {t.invoice_number && (
                      <div className="text-[10px] font-mono text-brand-700 mt-0.5">
                        Invoice: {t.invoice_number}
                      </div>
                    )}
                  </td>

                  {/* Qty & Shipments */}
                  <td className="p-4">
                    <div className="font-mono font-bold text-sm text-slate-900">
                      {t.expected_qty} Jars
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Shipments: <strong>{t.shipments.length}</strong> • Assigned: {t.assigned_qty_total}/{t.expected_qty}
                    </div>
                    {t.delivered_qty_total > 0 && (
                      <div className="text-[11px] font-semibold text-emerald-700">
                        Delivered: {t.delivered_qty_total}/{t.expected_qty}
                      </div>
                    )}
                  </td>

                  {/* Order Payment */}
                  <td className="p-4">
                    <div className="font-mono font-bold text-slate-900">
                      ₹{(t.total_amount || 0).toFixed(2)}
                    </div>
                    <div className="text-[11px] text-emerald-700 font-medium">
                      Paid: ₹{(t.paid_amount || 0).toFixed(2)}
                    </div>
                    {t.unpaid_amount > 0 ? (
                      <span className="inline-block mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                        Unpaid: ₹{t.unpaid_amount.toFixed(2)}
                      </span>
                    ) : (
                      <span className="inline-block mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                        {t.status === 'rejected' ? 'Cancelled' : 'Settled'}
                      </span>
                    )}
                  </td>

                  {/* Status */}
                  <td className="p-4">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        STATUS_BADGE[t.status] || 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {t.status.replace('_', ' ')}
                    </span>
                    {t.rejection_reason && (
                      <div className="text-[10px] text-rose-600 mt-1 max-w-[160px] truncate" title={t.rejection_reason}>
                        Reason: {t.rejection_reason}
                      </div>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="p-4 text-right space-x-1.5 whitespace-nowrap">
                    {t.remaining_assignable_qty > 0 && !['rejected', 'cancelled', 'completed'].includes(t.status) && (
                      <button
                        onClick={() => openAssignModal(t)}
                        className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-sm transition inline-flex items-center space-x-1"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Assign</span>
                      </button>
                    )}

                    {(t.status === 'requested' || (t.status === 'pending' && t.delivered_qty_total === 0)) && (
                      <button
                        onClick={() => {
                          setRejectModalOrder(t);
                          setRejectReason('');
                        }}
                        className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition inline-flex items-center space-x-1"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    )}

                    <button
                      onClick={() => openHistoryModal(t)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition inline-flex items-center space-x-1"
                      title="View Order Shipment & Payment History"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-500" />
                      <span>History</span>
                    </button>
                  </td>
                </tr>
              ))}
              {filteredTasks.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400 text-xs">
                    <Truck className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    No orders matching current filters for {allDatesMode ? 'all dates' : selectedDate}.
                    {!allDatesMode && (
                      <div className="mt-2">
                        <button onClick={setDateToTomorrow} className="text-brand-600 font-bold hover:underline">
                          Check Tomorrow&apos;s Orders &rarr;
                        </button>
                        {' or '}
                        <button onClick={() => setAllDatesMode(true)} className="text-purple-600 font-bold hover:underline">
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

      {/* ============================================================ */}
      {/* ASSIGN SHIPMENT MODAL                                        */}
      {/* ============================================================ */}
      {assignModalOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  Assign Shipment ({assignModalOrder.order_number})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {assignModalOrder.customer_name} • {assignModalOrder.product_name}
                </p>
              </div>
              <button onClick={() => setAssignModalOrder(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <div className="text-slate-400 text-[10px]">Ordered</div>
                <div className="font-bold text-slate-900 font-mono">{assignModalOrder.expected_qty} Jars</div>
              </div>
              <div>
                <div className="text-slate-400 text-[10px]">Unassigned</div>
                <div className="font-bold text-brand-700 font-mono">{assignModalOrder.remaining_assignable_qty} Jars</div>
              </div>
              <div>
                <div className="text-slate-400 text-[10px]">Unpaid Left</div>
                <div className="font-bold text-rose-700 font-mono">₹{assignModalOrder.unpaid_amount.toFixed(2)}</div>
              </div>
            </div>

            <form onSubmit={handleAssignShipment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Delivery Driver</label>
                <select
                  required
                  value={assignDriverId}
                  onChange={(e) => setAssignDriverId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white focus:outline-none focus:border-brand-500"
                >
                  <option value="" disabled>-- Choose Driver --</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.phone})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jars to Send (Max {assignModalOrder.remaining_assignable_qty})
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={assignModalOrder.remaining_assignable_qty}
                    required
                    value={assignQty}
                    onChange={(e) => handleAssignQtyChange(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Amount Driver Collects (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={assignCollectAmount}
                    onChange={(e) => setAssignCollectAmount(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Instructions for Driver (Optional)</label>
                <input
                  type="text"
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  placeholder="e.g. Collect empty jars from gate, deliver to 2nd floor"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setAssignModalOrder(null)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAssign}
                  className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-sm transition"
                >
                  {submittingAssign ? 'Assigning...' : 'Confirm & Dispatch Shipment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* REJECT ORDER MODAL                                           */}
      {/* ============================================================ */}
      {rejectModalOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <h3 className="font-bold text-base text-slate-900 mb-1">
              Reject Order Request ({rejectModalOrder.order_number})
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {rejectModalOrder.customer_name} • {rejectModalOrder.expected_qty} x {rejectModalOrder.product_name}
            </p>
            <form onSubmit={handleRejectOrder} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Rejection Reason</label>
                <textarea
                  rows={3}
                  required
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Outside delivery zone, stock unavailable for evening slot"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectModalOrder(null)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReject}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-sm transition"
                >
                  {submittingReject ? 'Rejecting...' : 'Reject Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* ORDER HISTORY MODAL (SHIPMENTS TAB & PAYMENTS TAB ONLY)      */}
      {/* ============================================================ */}
      {historyModalOrder && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-start pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  <span className="font-mono font-bold text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-800">
                    {historyModalOrder.order_number || `ORD-${historyModalOrder.id.slice(0, 6).toUpperCase()}`}
                  </span>
                  <h3 className="font-bold text-lg text-slate-900">
                    {historyModalOrder.customer_name}
                  </h3>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${STATUS_BADGE[historyModalOrder.status] || 'bg-slate-100 text-slate-700'}`}>
                    {historyModalOrder.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {historyModalOrder.expected_qty} x {historyModalOrder.product_name} • {historyModalOrder.scheduled_date} ({historyModalOrder.shift} shift)
                  {historyModalOrder.invoice_number ? ` • Invoice: ${historyModalOrder.invoice_number}` : ''}
                </p>
              </div>
              <button
                onClick={closeHistoryModal}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 2 Tabs Only: Shipments & Payments */}
            <div className="flex space-x-4 pt-3 border-b border-slate-100">
              <button
                onClick={() => setHistoryTab('shipments')}
                className={`pb-2.5 px-2 text-xs font-bold border-b-2 transition flex items-center space-x-1.5 ${
                  historyTab === 'shipments'
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                <span>Shipments ({historyModalOrder.shipments.length})</span>
              </button>
              <button
                onClick={() => setHistoryTab('payments')}
                className={`pb-2.5 px-2 text-xs font-bold border-b-2 transition flex items-center space-x-1.5 ${
                  historyTab === 'payments'
                    ? 'border-brand-600 text-brand-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Order Payments ({historyModalOrder.payments.length})</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto flex-1 py-4">
              {historyTab === 'shipments' ? (
                <div className="space-y-4">
                  {/* Progress Bar & Assign CTA */}
                  <div className="flex flex-wrap justify-between items-center gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <div className="grid grid-cols-4 gap-4 text-xs flex-1">
                      <div>
                        <div className="text-slate-400 text-[10px]">Ordered</div>
                        <div className="font-bold font-mono text-slate-900 text-sm">{historyModalOrder.expected_qty} Jars</div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-[10px]">Assigned</div>
                        <div className="font-bold font-mono text-sky-700 text-sm">{historyModalOrder.assigned_qty_total} Jars</div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-[10px]">Delivered</div>
                        <div className="font-bold font-mono text-emerald-700 text-sm">{historyModalOrder.delivered_qty_total} Jars</div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-[10px]">Unassigned</div>
                        <div className="font-bold font-mono text-amber-700 text-sm">{historyModalOrder.remaining_assignable_qty} Jars</div>
                      </div>
                    </div>
                    {historyModalOrder.remaining_assignable_qty > 0 && !['rejected', 'cancelled', 'completed'].includes(historyModalOrder.status) && (
                      <button
                        onClick={() => openAssignModal(historyModalOrder)}
                        className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold flex items-center space-x-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Assign Shipment</span>
                      </button>
                    )}
                  </div>

                  {/* Shipments Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                        <tr>
                          <th className="p-3">Shipment #</th>
                          <th className="p-3">Driver</th>
                          <th className="p-3 text-center">Assigned</th>
                          <th className="p-3 text-center">Delivered</th>
                          <th className="p-3 text-center">Empties</th>
                          <th className="p-3 text-right">To Collect</th>
                          <th className="p-3 text-right">Collected</th>
                          <th className="p-3">Status &amp; Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {historyModalOrder.shipments.map((s) => (
                          <tr key={s.id} className="hover:bg-slate-50/60">
                            <td className="p-3 font-mono font-bold text-slate-900">
                              {s.shipment_number}
                              {s.notes && <div className="text-[10px] font-sans font-normal text-slate-400 mt-0.5">{s.notes}</div>}
                            </td>
                            <td className="p-3">
                              <div className="font-semibold text-slate-800">{s.driver_name || 'Unassigned'}</div>
                              {s.driver_phone && <div className="text-[10px] text-slate-400">{s.driver_phone}</div>}
                            </td>
                            <td className="p-3 text-center font-mono font-bold text-slate-900">{s.assigned_qty}</td>
                            <td className="p-3 text-center font-mono font-bold text-emerald-700">
                              {s.status === 'assigned' || s.status === 'in_transit' ? '—' : s.delivered_qty}
                            </td>
                            <td className="p-3 text-center font-mono text-blue-700">
                              {s.status === 'assigned' || s.status === 'in_transit' ? '—' : s.empty_collected_qty}
                            </td>
                            <td className="p-3 text-right font-mono text-slate-600">₹{s.amount_to_collect.toFixed(2)}</td>
                            <td className="p-3 text-right font-mono font-bold text-emerald-700">
                              ₹{s.cash_collected.toFixed(2)}
                            </td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${STATUS_BADGE[s.status] || 'bg-slate-100 text-slate-700'}`}>
                                {s.status.replace('_', ' ')}
                              </span>
                              {s.delivered_at && (
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  {new Date(s.delivered_at).toLocaleString()}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                        {historyModalOrder.shipments.length === 0 && (
                          <tr>
                            <td colSpan={8} className="p-6 text-center text-slate-400">
                              No shipments assigned to this order yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* TAB 2: ORDER PAYMENTS ONLY */
                <div className="space-y-4">
                  {/* Order Payment Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                      <div className="text-[11px] text-slate-500 font-medium">Order Invoice Total</div>
                      <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
                        ₹{historyModalOrder.total_amount.toFixed(2)}
                      </div>
                      {historyModalOrder.invoice_number && (
                        <div className="text-[10px] font-mono text-slate-400">{historyModalOrder.invoice_number}</div>
                      )}
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5">
                      <div className="text-[11px] text-emerald-700 font-medium">Total Paid for Order</div>
                      <div className="text-lg font-bold font-mono text-emerald-800 mt-0.5">
                        ₹{historyModalOrder.paid_amount.toFixed(2)}
                      </div>
                    </div>
                    <div className={`${historyModalOrder.unpaid_amount > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'} border rounded-xl p-3.5 flex justify-between items-center`}>
                      <div>
                        <div className={`text-[11px] font-medium ${historyModalOrder.unpaid_amount > 0 ? 'text-rose-700' : 'text-slate-500'}`}>
                          Unpaid Amount Left
                        </div>
                        <div className={`text-lg font-bold font-mono mt-0.5 ${historyModalOrder.unpaid_amount > 0 ? 'text-rose-800' : 'text-emerald-700'}`}>
                          ₹{historyModalOrder.unpaid_amount.toFixed(2)}
                        </div>
                      </div>
                      {historyModalOrder.unpaid_amount > 0 && historyModalOrder.status !== 'rejected' && (
                        <button
                          onClick={() => {
                            setPayAmount(historyModalOrder.unpaid_amount);
                            setShowQuickPay(!showQuickPay);
                          }}
                          className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold flex items-center space-x-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Pay</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Quick Record Order Payment Form */}
                  {showQuickPay && (
                    <form onSubmit={handleRecordOrderPayment} className="bg-brand-50/60 border border-brand-200 rounded-xl p-4 space-y-3">
                      <h4 className="text-xs font-bold text-brand-900">Record Payment for {historyModalOrder.order_number}</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Amount (₹)</label>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            required
                            value={payAmount}
                            onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-1.5 border rounded-lg text-xs font-semibold bg-white"
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
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Reference / UTR (Optional)</label>
                          <input
                            type="text"
                            value={payRefId}
                            onChange={(e) => setPayRefId(e.target.value)}
                            placeholder="UTR / Ref #"
                            className="w-full px-3 py-1.5 border rounded-lg text-xs bg-white"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Notes</label>
                        <input
                          type="text"
                          value={payNotes}
                          onChange={(e) => setPayNotes(e.target.value)}
                          placeholder="Collected after delivery"
                          className="w-full px-3 py-1.5 border rounded-lg text-xs bg-white"
                        />
                      </div>
                      <div className="flex justify-end space-x-2">
                        <button
                          type="button"
                          onClick={() => setShowQuickPay(false)}
                          className="px-3 py-1 border border-slate-200 rounded-lg text-xs text-slate-600 bg-white"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={savingPayment}
                          className="px-4 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold"
                        >
                          {savingPayment ? 'Saving...' : 'Save Order Payment'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Order Payments Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                        <tr>
                          <th className="p-3">Receipt #</th>
                          <th className="p-3">Date &amp; Time</th>
                          <th className="p-3">Stage</th>
                          <th className="p-3">Method</th>
                          <th className="p-3 text-right">Amount</th>
                          <th className="p-3">Notes / Collector</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {historyModalOrder.payments.map((p) => {
                          const stage = STAGE_LABEL[p.payment_stage] || STAGE_LABEL.later;
                          return (
                            <tr key={p.id} className="hover:bg-slate-50/60">
                              <td className="p-3 font-mono font-bold text-slate-900">{p.payment_number}</td>
                              <td className="p-3 text-slate-600">{new Date(p.payment_date).toLocaleString()}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${stage.cls}`}>
                                  {stage.label}
                                </span>
                              </td>
                              <td className="p-3 uppercase text-[11px] font-medium text-slate-700">
                                {p.payment_method}
                                {p.payment_ref_id && <div className="text-[10px] text-slate-400 font-mono">{p.payment_ref_id}</div>}
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-emerald-700">₹{p.amount.toFixed(2)}</td>
                              <td className="p-3 text-slate-500">
                                <div>{p.notes || '—'}</div>
                                {p.collector_name && <div className="text-[10px] text-slate-400">By: {p.collector_name}</div>}
                              </td>
                            </tr>
                          );
                        })}
                        {historyModalOrder.payments.length === 0 && (
                          <tr>
                            <td colSpan={6} className="p-6 text-center text-slate-400">
                              No payments recorded for this order yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={closeHistoryModal}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* OWNER CREATE ORDER + SHIPMENTS MODAL                         */}
      {/* ============================================================ */}
      {isCreateOrderOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="font-bold text-base text-slate-900">Create New Order &amp; Assign Shipments</h3>
                <p className="text-xs text-slate-500">Automatically generates the order invoice and splits delivery across one or more drivers</p>
              </div>
              <button onClick={() => setIsCreateOrderOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Customer</label>
                  <select
                    required
                    value={newCustomerId}
                    onChange={(e) => setNewCustomerId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white"
                  >
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.phone})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Product</label>
                  <select
                    required
                    value={newProductId}
                    onChange={(e) => setNewProductId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (₹{p.selling_price})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity (Jars)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newQty}
                    onChange={(e) => setNewQty(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Delivery Date</label>
                  <input
                    type="date"
                    required
                    value={newScheduledDate}
                    onChange={(e) => setNewScheduledDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Shift</label>
                  <select
                    value={newShift}
                    onChange={(e) => setNewShift(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white"
                  >
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="evening">Evening</option>
                  </select>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex justify-between items-center text-xs">
                <span className="text-slate-600 font-medium">Estimated Order Invoice Total (incl. GST):</span>
                <span className="text-base font-extrabold font-mono text-slate-900">₹{estimatedOrderTotal.toFixed(2)}</span>
              </div>

              {/* Upfront payment while creating order */}
              <div className="border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                <div className="text-xs font-bold text-slate-800">Payment Received While Ordering (Optional)</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Amount Paid Now (₹)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={upfrontPayAmount}
                      onChange={(e) => setUpfrontPayAmount(parseFloat(e.target.value) || 0)}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Method</label>
                    <select
                      value={upfrontPayMethod}
                      onChange={(e) => setUpfrontPayMethod(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
                    >
                      <option value="cash">Cash</option>
                      <option value="upi">UPI</option>
                      <option value="bank_transfer">Bank Transfer</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Ref / UTR</label>
                    <input
                      type="text"
                      value={upfrontPayRef}
                      onChange={(e) => setUpfrontPayRef(e.target.value)}
                      placeholder="Optional"
                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Optional Initial Shipments Builder */}
              <div className="border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-xs font-bold text-slate-800">Assign Shipments Now (Optional)</div>
                    <div className="text-[11px] text-slate-500">
                      Split {newQty} jars across 1 or more drivers ({totalInitialShippedQty}/{newQty} assigned)
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={addInitialShipmentRow}
                    disabled={totalInitialShippedQty >= newQty}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white rounded-lg text-xs font-bold flex items-center space-x-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Shipment</span>
                  </button>
                </div>

                {initialShipments.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <div className="col-span-5">
                      <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Driver</label>
                      <select
                        value={row.driver_id}
                        onChange={(e) => {
                          const next = [...initialShipments];
                          next[idx].driver_id = e.target.value;
                          setInitialShipments(next);
                        }}
                        className="w-full px-2 py-1.5 border rounded-lg text-xs bg-white"
                      >
                        {drivers.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-3">
                      <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Jars Qty</label>
                      <input
                        type="number"
                        min="1"
                        max={newQty}
                        value={row.assigned_qty}
                        onChange={(e) => {
                          const next = [...initialShipments];
                          next[idx].assigned_qty = parseInt(e.target.value, 10) || 1;
                          setInitialShipments(next);
                        }}
                        className="w-full px-2 py-1.5 border rounded-lg text-xs font-mono font-bold"
                      />
                    </div>
                    <div className="col-span-3">
                      <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Collect (₹)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.amount_to_collect}
                        onChange={(e) => {
                          const next = [...initialShipments];
                          next[idx].amount_to_collect = e.target.value;
                          setInitialShipments(next);
                        }}
                        className="w-full px-2 py-1.5 border rounded-lg text-xs font-mono font-bold"
                      />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setInitialShipments(initialShipments.filter((_, i) => i !== idx))}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Order Notes (Optional)</label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Special delivery instructions or event details"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsCreateOrderOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingOrder}
                  className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-sm transition"
                >
                  {creatingOrder ? 'Creating Order...' : 'Create Order & Generate Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
