import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Truck, 
  MapPin, 
  Phone, 
  MessageCircle,
  CheckCircle2, 
  XCircle, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  Package, 
  IndianRupee, 
  LogOut,
  User as UserIcon,
  BarChart3,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  Calendar,
  Layers,
  ArrowRight,
  ClipboardList,
  Search,
  Plus,
  Minus
} from 'lucide-react';

interface DriverShipment {
  id: string;
  shipment_number: string;
  order_id: string;
  order_number?: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  delivery_instructions?: string;
  customer_jar_balance: number;
  product_name: string;
  assigned_qty: number;
  order_total_qty: number;
  amount_to_collect: number;
  scheduled_date: string;
  shift: string;
  status: string;
  notes?: string;
}

interface CompletedShipment {
  id: string;
  task_id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  product_name: string;
  delivered_qty: number;
  empty_collected_qty: number;
  cash_collected: number;
  payment_mode: string;
  delivery_status: string;
  delivered_at: string;
  notes?: string;
}

interface ColleagueDriver {
  id: string;
  name: string;
  phone: string;
  is_current: boolean;
}

interface MonthlyReport {
  driver_id: string;
  driver_name: string;
  month: string;
  total_stops: number;
  completed_stops: number;
  partially_completed_stops: number;
  total_jars_delivered: number;
  total_empties_collected: number;
  total_cash_collected: number;
  completion_rate: number;
  daily_stats: Array<{
    date: string;
    delivered_jars: number;
    empty_jars: number;
    cash_collected: number;
    stops_completed: number;
  }>;
}

export const DriverPortal: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/auth/login');
  };

  // Bottom Navigation Tabs
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'profile'>('active');

  // Active Shipments state
  const [stops, setStops] = useState<DriverShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Jars on vehicle stock (Default: 3 jars, persisted in localStorage)
  const [jarsOnVan, setJarsOnVan] = useState<number>(() => {
    const saved = localStorage.getItem('aquaflow_driver_van_jars');
    return saved !== null ? parseInt(saved, 10) : 3;
  });

  // Completed Shipments state
  const [completedShipments, setCompletedShipments] = useState<CompletedShipment[]>([]);
  const [loadingCompleted, setLoadingCompleted] = useState(false);

  // Profile & Monthly Report state
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReport | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [loadingReport, setLoadingReport] = useState(false);

  // Available colleague drivers for reassignment
  const [colleagueDrivers, setColleagueDrivers] = useState<ColleagueDriver[]>([]);
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [targetColleagueId, setTargetColleagueId] = useState<string>('');
  const [reassignNotes, setReassignNotes] = useState('');

  // Network & Offline Sync
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState<any[]>(() => {
    const saved = localStorage.getItem('aquaflow_driver_offline_queue');
    return saved ? JSON.parse(saved) : [];
  });

  // Active Shipment Detail Drawer
  const [activeStop, setActiveStop] = useState<DriverShipment | null>(null);
  const [deliveredQty, setDeliveredQty] = useState(1);
  const [emptyQty, setEmptyQty] = useState(1);
  const [cashCollected, setCashCollected] = useState(0);
  const [paymentMode, setPaymentMode] = useState<'cash' | 'upi' | 'unpaid'>('unpaid');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  // Save jars on van
  const updateJarsOnVan = (newCount: number) => {
    const val = Math.max(0, newCount);
    setJarsOnVan(val);
    localStorage.setItem('aquaflow_driver_van_jars', val.toString());
  };

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Fetch active assigned shipments
  const loadStops = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/deliveries/driver/shipments');
      setStops(res.data);
    } catch (err) {
      console.error('Failed to load driver shipments', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch completed shipments from his end
  const loadCompletedShipments = async () => {
    try {
      setLoadingCompleted(true);
      const res = await apiClient.get('/deliveries/driver/completed');
      setCompletedShipments(res.data);
    } catch (err) {
      console.error('Failed to load completed shipments', err);
    } finally {
      setLoadingCompleted(false);
    }
  };

  // Fetch monthly report for driver profile
  const loadMonthlyReport = async (monthStr: string) => {
    try {
      setLoadingReport(true);
      const res = await apiClient.get(`/deliveries/driver/monthly-report?month=${monthStr}`);
      setMonthlyReport(res.data);
    } catch (err) {
      console.error('Failed to load monthly report', err);
    } finally {
      setLoadingReport(false);
    }
  };

  // Fetch available drivers in branch for reassignment
  const loadColleagueDrivers = async () => {
    try {
      const res = await apiClient.get('/deliveries/available-drivers');
      setColleagueDrivers(res.data);
      const other = res.data.find((d: ColleagueDriver) => !d.is_current);
      if (other) {
        setTargetColleagueId(other.id);
      }
    } catch (err) {
      console.error('Failed to load colleague drivers', err);
    }
  };

  useEffect(() => {
    loadStops();
    loadColleagueDrivers();
  }, []);

  useEffect(() => {
    if (activeTab === 'completed') {
      loadCompletedShipments();
    } else if (activeTab === 'profile') {
      loadMonthlyReport(selectedMonth);
    }
  }, [activeTab, selectedMonth]);

  // Offline queue synchronization
  const syncOfflineQueue = async () => {
    const queue = JSON.parse(localStorage.getItem('aquaflow_driver_offline_queue') || '[]');
    if (queue.length === 0) return;

    try {
      await apiClient.post('/deliveries/sync', { actions: queue });
      localStorage.removeItem('aquaflow_driver_offline_queue');
      setOfflineQueue([]);
      alert(`Synchronized ${queue.length} offline deliveries to central plant!`);
      await loadStops();
      if (activeTab === 'completed') loadCompletedShipments();
    } catch (err) {
      console.error('Offline sync failed', err);
    }
  };

  // Open shipment details modal — autofill jar amounts & amount to collect
  const openOrderDetails = (stop: DriverShipment) => {
    setActiveStop(stop);
    setDeliveredQty(stop.assigned_qty);
    setEmptyQty(stop.assigned_qty);
    setCashCollected(stop.amount_to_collect || 0);
    setPaymentMode((stop.amount_to_collect || 0) > 0 ? 'cash' : 'unpaid');
    setDeliveryNotes('');
  };

  // Execute shipment completion
  const handleRecordStop = async () => {
    if (!activeStop) return;

    const isPartial = deliveredQty < activeStop.assigned_qty;
    const effectiveMode = cashCollected > 0 ? (paymentMode === 'unpaid' ? 'cash' : paymentMode) : 'unpaid';

    const payload = {
      delivered_qty: deliveredQty,
      empty_collected_qty: emptyQty,
      cash_collected: cashCollected,
      payment_mode: effectiveMode,
      delivery_status: 'delivered',
      notes: deliveryNotes || (isPartial ? `Partial delivery: ${deliveredQty} of ${activeStop.assigned_qty} jars delivered.` : undefined),
      client_tx_id: `offline-shp-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    };

    if (!isOnline) {
      const updatedQueue = [...offlineQueue, { ...payload, delivery_task_id: activeStop.order_id }];
      setOfflineQueue(updatedQueue);
      localStorage.setItem('aquaflow_driver_offline_queue', JSON.stringify(updatedQueue));

      setStops(stops.filter((s) => s.id !== activeStop.id));
      updateJarsOnVan(Math.max(0, jarsOnVan - deliveredQty));
      setActiveStop(null);
      alert('Shipment recorded offline. Will sync automatically when connected.');
      return;
    }

    try {
      await apiClient.post(`/deliveries/shipments/${activeStop.id}/complete`, payload);
      updateJarsOnVan(Math.max(0, jarsOnVan - deliveredQty));
      setActiveStop(null);
      await loadStops();
      if (activeTab === 'completed') loadCompletedShipments();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to record shipment');
    }
  };

  // Reassign shipment to another driver
  const handleReassignOrder = async () => {
    if (!activeStop || !targetColleagueId) return;

    try {
      const res = await apiClient.post(`/deliveries/shipments/${activeStop.id}/reassign`, {
        new_driver_id: targetColleagueId,
        notes: reassignNotes || 'Reassigned from driver van'
      });
      alert(res.data.message || 'Shipment successfully reassigned to another driver!');
      setIsReassignModalOpen(false);
      setActiveStop(null);
      await loadStops();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to reassign shipment');
    }
  };

  // Filtered active shipments
  const activeStops = stops.filter(s => {
    const isUnfinished = s.status === 'assigned' || s.status === 'in_transit';
    if (!isUnfinished) return false;
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      s.customer_name?.toLowerCase().includes(query) ||
      s.customer_phone?.includes(query) ||
      s.customer_address?.toLowerCase().includes(query) ||
      s.shipment_number?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between pb-20 select-none">
      {/* Driver Header */}
      <header className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center sticky top-0 z-20 shadow-md">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-gradient-to-tr from-brand-600 to-brand-400 rounded-xl text-white shadow-lg shadow-brand-500/20">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-extrabold text-sm text-white tracking-tight">AquaFlow Driver</h1>
              <span className="text-[10px] bg-brand-500/20 text-brand-300 font-semibold px-1.5 py-0.5 rounded">PWA</span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium truncate max-w-[150px]">
              {user?.full_name || 'Driver Route Partner'}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
            isOnline ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
          }`}>
            {isOnline ? <Wifi className="w-3 h-3 mr-1" /> : <WifiOff className="w-3 h-3 mr-1" />}
            {isOnline ? 'Live' : 'Offline'}
          </span>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1 text-slate-400 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800/80 transition-colors cursor-pointer"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Offline Queue Notice */}
      {offlineQueue.length > 0 && (
        <div className="bg-amber-600 text-white px-4 py-2 text-xs flex justify-between items-center font-medium shadow-sm">
          <span>{offlineQueue.length} offline drop-offs pending sync</span>
          {isOnline && (
            <button
              onClick={syncOfflineQueue}
              className="bg-white text-amber-900 px-2 py-0.5 rounded font-bold text-[10px] shadow"
            >
              Sync Now
            </button>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* TAB 1: ACTIVE ORDERS */}
      {/* ======================================================== */}
      {activeTab === 'active' && (
        <main className="p-4 space-y-3.5 flex-1 overflow-y-auto">
          {/* Driver Vehicle Inventory Banner */}
          <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-brand-950/60 p-3.5 rounded-2xl border border-brand-500/30 shadow-lg">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-[11px] text-brand-300 font-semibold tracking-wide uppercase flex items-center gap-1">
                  <Package className="w-3.5 h-3.5" />
                  <span>Jars With You on Vehicle</span>
                </div>
                <div className="text-xl font-extrabold text-white font-mono mt-0.5">
                  {jarsOnVan} <span className="text-xs font-normal text-slate-400">Filled 20L Jars</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-700/60">
                <button
                  onClick={() => updateJarsOnVan(jarsOnVan - 1)}
                  className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold text-sm"
                  title="Remove 1 Jar"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => updateJarsOnVan(jarsOnVan + 1)}
                  className="w-7 h-7 rounded-lg bg-brand-600 hover:bg-brand-500 text-white flex items-center justify-center font-bold text-sm shadow"
                  title="Add 1 Jar"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    const reload = prompt('Enter filled jars loaded on vehicle:', '10');
                    if (reload !== null) updateJarsOnVan(parseInt(reload, 10) || 0);
                  }}
                  className="px-2 py-1 text-[10px] font-bold bg-slate-800 text-slate-300 hover:text-white rounded-lg"
                >
                  Load
                </button>
              </div>
            </div>
            {jarsOnVan <= 2 && (
              <div className="mt-2 text-[10px] text-amber-400 flex items-center gap-1 bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-500/20">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                <span>Low stock on vehicle! Reload jars from depot or reassign orders.</span>
              </div>
            )}
          </div>

          {/* Search & Counts Header */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search active orders..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
              />
            </div>
            <button
              onClick={loadStops}
              className="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300"
              title="Refresh Queue"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex justify-between items-center text-xs text-slate-400 font-medium px-1">
            <span>Active Deliveries ({activeStops.length})</span>
            <span>Shift: Today</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading daily delivery dispatch...</div>
          ) : activeStops.length === 0 ? (
            <div className="p-8 text-center bg-slate-950/60 rounded-2xl border border-slate-800 space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <div className="font-bold text-sm text-white">All Clear! No Pending Deliveries</div>
              <p className="text-xs text-slate-400">
                You have fulfilled all assigned customer stops for today's run.
              </p>
            </div>
          ) : (
            activeStops.map((stop, index) => {
              const hasInsufficientStock = jarsOnVan < stop.assigned_qty;
              return (
                <div
                  key={stop.id}
                  onClick={() => openOrderDetails(stop)}
                  className="p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden bg-slate-950 border-slate-800 hover:border-brand-500/60 shadow-lg"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 bg-slate-800 text-brand-300 rounded-lg">
                        #{index + 1}
                      </span>
                      <h3 className="font-bold text-sm text-white truncate max-w-[180px]">
                        {stop.customer_name}
                      </h3>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-brand-500/20 text-brand-300 border border-brand-500/30">
                      {stop.shipment_number}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-slate-400 mb-3">
                    <div className="flex items-start gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                      <span className="line-clamp-1">{stop.customer_address}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                        <span>{stop.customer_phone}</span>
                      </div>
                      <span className="text-[10px] bg-blue-500/15 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-semibold">
                        Jars at Customer: {stop.customer_jar_balance}
                      </span>
                    </div>
                  </div>

                  {/* Stock Warning Tag */}
                  {hasInsufficientStock && (
                    <div className="mb-3 px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded-lg text-[10px] text-amber-300 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                      <span>Stock shortfall: You have {jarsOnVan} jars, shipment requires {stop.assigned_qty}.</span>
                    </div>
                  )}

                  <div className="pt-2.5 border-t border-slate-800/80 flex justify-between items-center text-xs">
                    <div className="font-semibold text-brand-300">
                      {stop.assigned_qty} x {stop.product_name}
                    </div>
                    <div className="flex items-center gap-2">
                      {stop.amount_to_collect > 0 && (
                        <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                          Collect ₹{stop.amount_to_collect.toFixed(0)}
                        </span>
                      )}
                      <div className="flex items-center gap-1 text-brand-400 font-bold text-xs">
                        <span>Deliver</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </main>
      )}

      {/* ======================================================== */}
      {/* TAB 2: COMPLETED ORDER SHIPMENTS FROM HIS END */}
      {/* ======================================================== */}
      {activeTab === 'completed' && (
        <main className="p-4 space-y-3.5 flex-1 overflow-y-auto">
          {/* Summary stats strip */}
          <div className="grid grid-cols-3 gap-2 bg-slate-950 p-3 rounded-2xl border border-slate-800 shadow">
            <div className="text-center">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Completed</div>
              <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
                {completedShipments.length}
              </div>
            </div>
            <div className="text-center border-x border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Jars Delivered</div>
              <div className="text-lg font-bold font-mono text-white mt-0.5">
                {completedShipments.reduce((sum, s) => sum + s.delivered_qty, 0)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Empties Got</div>
              <div className="text-lg font-bold font-mono text-brand-400 mt-0.5">
                {completedShipments.reduce((sum, s) => sum + s.empty_collected_qty, 0)}
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center text-xs text-slate-400 font-medium px-1">
            <span>Delivery Shipment History</span>
            <button
              onClick={loadCompletedShipments}
              className="text-brand-400 hover:text-brand-300 flex items-center gap-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingCompleted ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {loadingCompleted ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading completed shipments...</div>
          ) : completedShipments.length === 0 ? (
            <div className="p-8 text-center bg-slate-950/60 rounded-2xl border border-slate-800 space-y-2">
              <ClipboardList className="w-10 h-10 text-slate-500 mx-auto" />
              <div className="font-bold text-sm text-white">No Completed Shipments Yet</div>
              <p className="text-xs text-slate-400">
                Shipments you deliver will be logged and archived here with timestamps and receipts.
              </p>
            </div>
          ) : (
            completedShipments.map((shipment) => (
              <div
                key={shipment.id}
                className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-2.5 shadow"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-sm text-white">{shipment.customer_name}</h3>
                    <div className="text-[11px] text-slate-400 truncate max-w-[220px]">
                      {shipment.customer_address}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    shipment.delivery_status === 'delivered'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}>
                    {shipment.delivery_status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 bg-slate-900/80 p-2.5 rounded-xl border border-slate-800 text-center text-xs">
                  <div>
                    <div className="text-[10px] text-slate-400">Delivered</div>
                    <div className="font-bold text-white font-mono mt-0.5">
                      {shipment.delivered_qty} jars
                    </div>
                  </div>
                  <div className="border-x border-slate-800">
                    <div className="text-[10px] text-slate-400">Empties</div>
                    <div className="font-bold text-brand-300 font-mono mt-0.5">
                      {shipment.empty_collected_qty} jars
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">Cash COD</div>
                    <div className="font-bold text-emerald-400 font-mono mt-0.5">
                      ₹{shipment.cash_collected.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center text-[11px] text-slate-500 pt-1">
                  <span>Product: {shipment.product_name}</span>
                  <span>{new Date(shipment.delivered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            ))
          )}
        </main>
      )}

      {/* ======================================================== */}
      {/* TAB 3: DRIVER PROFILE & MONTHLY REPORTS */}
      {/* ======================================================== */}
      {activeTab === 'profile' && (
        <main className="p-4 space-y-4 flex-1 overflow-y-auto">
          {/* Driver Profile Card */}
          <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 rounded-2xl border border-slate-800 shadow-xl space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-600 to-emerald-500 flex items-center justify-center text-white font-extrabold text-lg shadow-lg">
                {user?.full_name?.charAt(0) || 'D'}
              </div>
              <div className="flex-1">
                <h2 className="font-extrabold text-base text-white">{user?.full_name}</h2>
                <div className="text-xs text-brand-400 font-semibold capitalize">
                  {user?.role?.replace('_', ' ')}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  <span>{user?.phone || 'No phone registered'}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-xs text-slate-400">
              <div>
                <span className="text-slate-500 text-[10px] block">Tenant Business</span>
                <span className="font-semibold text-slate-300">AquaPure Systems</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">Duty Status</span>
                <span className="font-semibold text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Active on Route
                </span>
              </div>
            </div>
          </div>

          {/* Monthly Report Section */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-brand-400" />
                <h3 className="font-bold text-sm text-white">Monthly Delivery Performance</h3>
              </div>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-brand-300 font-semibold focus:outline-none"
              />
            </div>

            {loadingReport ? (
              <div className="p-6 text-center text-xs text-slate-400">Compiling monthly report...</div>
            ) : monthlyReport ? (
              <div className="space-y-3">
                {/* 4 Metric Cards */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 shadow">
                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Completed Stops</div>
                    <div className="text-xl font-extrabold text-emerald-400 font-mono mt-1">
                      {monthlyReport.completed_stops}
                      <span className="text-xs font-normal text-slate-400 ml-1">/ {monthlyReport.total_stops}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      {monthlyReport.completion_rate}% fulfillment rate
                    </div>
                  </div>

                  <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 shadow">
                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Jars Delivered</div>
                    <div className="text-xl font-extrabold text-brand-400 font-mono mt-1">
                      {monthlyReport.total_jars_delivered}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      20L filled water units
                    </div>
                  </div>

                  <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 shadow">
                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Empties Retrieved</div>
                    <div className="text-xl font-extrabold text-blue-400 font-mono mt-1">
                      {monthlyReport.total_empties_collected}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      Accounted returnable bottles
                    </div>
                  </div>

                  <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 shadow">
                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Cash Deposited</div>
                    <div className="text-xl font-extrabold text-white font-mono mt-1">
                      ₹{monthlyReport.total_cash_collected.toLocaleString('en-IN')}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      Total COD collections
                    </div>
                  </div>
                </div>

                {/* Daily Activity Breakdown */}
                {monthlyReport.daily_stats && monthlyReport.daily_stats.length > 0 && (
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2.5">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                      Daily Breakdown ({monthlyReport.month})
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {monthlyReport.daily_stats.map((stat, idx) => (
                        <div
                          key={idx}
                          className="flex justify-between items-center text-xs py-1.5 px-2.5 bg-slate-900/60 rounded-xl border border-slate-800/80"
                        >
                          <span className="font-mono text-slate-300 font-medium">{stat.date}</span>
                          <div className="flex items-center gap-3 font-mono">
                            <span className="text-brand-300 font-bold">{stat.delivered_jars} jars</span>
                            <span className="text-slate-400">{stat.empty_jars} empties</span>
                            <span className="text-emerald-400 font-bold">₹{stat.cash_collected}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Quick Driver Logout */}
          <button
            onClick={handleLogout}
            className="w-full py-3 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out of Driver Account</span>
          </button>
        </main>
      )}

      {/* ======================================================== */}
      {/* ORDER DETAILS & COMPLETION DRAWER */}
      {/* ======================================================== */}
      {activeStop && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md p-5 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto">
            {/* Drawer Header */}
            <div className="flex justify-between items-start pb-2 border-b border-slate-800">
              <div>
                <span className="text-[10px] font-bold text-brand-400 uppercase tracking-wider">
                  Order Details & Drop-off
                </span>
                <h3 className="font-extrabold text-base text-white mt-0.5">{activeStop.customer_name}</h3>
                <div className="text-xs text-slate-400">{activeStop.product_name}</div>
              </div>
              <button
                onClick={() => setActiveStop(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* Quick Action Dial / WhatsApp / Maps */}
            <div className="grid grid-cols-3 gap-2">
              <a
                href={`tel:${activeStop.customer_phone}`}
                className="p-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-center flex flex-col items-center gap-1 transition"
              >
                <Phone className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] font-bold text-slate-300">Call</span>
              </a>
              <a
                href={`https://wa.me/91${activeStop.customer_phone?.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="p-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-center flex flex-col items-center gap-1 transition"
              >
                <MessageCircle className="w-4 h-4 text-brand-400" />
                <span className="text-[10px] font-bold text-slate-300">WhatsApp</span>
              </a>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activeStop.customer_address)}`}
                target="_blank"
                rel="noreferrer"
                className="p-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-center flex flex-col items-center gap-1 transition"
              >
                <MapPin className="w-4 h-4 text-amber-400" />
                <span className="text-[10px] font-bold text-slate-300">Maps</span>
              </a>
            </div>

            {/* Address, Jars at Customer & Collection Amount (NO jar rate & NO customer dues) */}
            <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2 text-xs">
              <div className="text-slate-400 flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-500 flex-shrink-0 mt-0.5" />
                <span className="text-slate-200">{activeStop.customer_address}</span>
              </div>
              {activeStop.delivery_instructions && (
                <div className="p-2 bg-slate-900 rounded-xl text-[11px] text-amber-300 font-medium">
                  Note: {activeStop.delivery_instructions}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-900">
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-2 text-center">
                  <div className="text-[10px] text-blue-300 font-semibold">Jars at Customer</div>
                  <div className="text-base font-extrabold font-mono text-white mt-0.5">
                    {activeStop.customer_jar_balance} Jars
                  </div>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-2 text-center">
                  <div className="text-[10px] text-emerald-300 font-semibold">Amount to Collect</div>
                  <div className="text-base font-extrabold font-mono text-emerald-400 mt-0.5">
                    ₹{(activeStop.amount_to_collect || 0).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            {/* Stock Comparison & Rule Warning */}
            {jarsOnVan < activeStop.assigned_qty && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Insufficient Stock on Vehicle</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  You have <strong className="text-white">{jarsOnVan} jars</strong> with you, but shipment requires <strong className="text-white">{activeStop.assigned_qty} jars</strong>.
                  Status will be marked <span className="text-amber-400 font-bold uppercase">Partially Completed</span>.
                </p>
                <button
                  type="button"
                  onClick={() => setIsReassignModalOpen(true)}
                  className="mt-2 w-full py-1.5 bg-amber-600/30 hover:bg-amber-600/40 text-amber-300 border border-amber-500/40 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>Transfer Shipment to Another Driver</span>
                </button>
              </div>
            )}

            {/* Steppers: Delivered & Collected (Autofilled) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
                <div className="text-xs text-slate-400 mb-1 font-semibold">Delivered Jars</div>
                <div className="flex items-center justify-center space-x-3">
                  <button
                    onClick={() => setDeliveredQty(Math.max(0, deliveredQty - 1))}
                    className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold"
                  >
                    -
                  </button>
                  <span className="text-2xl font-bold font-mono text-white">{deliveredQty}</span>
                  <button
                    onClick={() => setDeliveredQty(deliveredQty + 1)}
                    className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold"
                  >
                    +
                  </button>
                </div>
                <div className="text-[10px] text-slate-500 mt-1">Assigned: {activeStop.assigned_qty}</div>
              </div>

              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-center">
                <div className="text-xs text-slate-400 mb-1 font-semibold">Empties Taken</div>
                <div className="flex items-center justify-center space-x-3">
                  <button
                    onClick={() => setEmptyQty(Math.max(0, emptyQty - 1))}
                    className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold"
                  >
                    -
                  </button>
                  <span className="text-2xl font-bold font-mono text-brand-300">{emptyQty}</span>
                  <button
                    onClick={() => setEmptyQty(emptyQty + 1)}
                    className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold"
                  >
                    +
                  </button>
                </div>
                <div className="text-[10px] text-slate-500 mt-1">Empty 20L jars</div>
              </div>
            </div>

            {/* Amount Collected input (NO Unit Price shown!) */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-semibold text-slate-400">
                <span>Amount Collected (₹)</span>
                <div className="flex gap-1">
                  {(['cash', 'upi', 'unpaid'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setPaymentMode(mode);
                        if (mode === 'unpaid') setCashCollected(0);
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        paymentMode === mode
                          ? 'bg-brand-600 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative">
                <IndianRupee className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cashCollected}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value) || 0;
                    setCashCollected(v);
                    if (v > 0 && paymentMode === 'unpaid') setPaymentMode('cash');
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-white font-mono font-bold focus:outline-none focus:border-brand-500"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Notes input */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Delivery Notes / Remarks</label>
              <input
                type="text"
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                placeholder="e.g. Delivered on 2nd floor, handed to security"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-brand-500"
              />
            </div>

            {/* Buttons: Submit & Reassign */}
            <div className="space-y-2 pt-1">
              <button
                onClick={handleRecordStop}
                className={`w-full py-3.5 rounded-2xl text-sm font-extrabold shadow-lg transition flex items-center justify-center gap-2 ${
                  deliveredQty < activeStop.assigned_qty
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>
                  {deliveredQty < activeStop.assigned_qty
                    ? `Confirm Partial Drop-Off (${deliveredQty} of ${activeStop.assigned_qty} Jars)`
                    : `Confirm Full Shipment (${deliveredQty} Jars)`}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIsReassignModalOpen(true)}
                className="w-full py-2.5 bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5"
              >
                <span>Transfer Shipment to Another Driver</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* REASSIGN TO ANOTHER DRIVER MODAL */}
      {/* ======================================================== */}
      {isReassignModalOpen && activeStop && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h3 className="font-extrabold text-sm text-white">Reassign Order</h3>
              <button
                onClick={() => setIsReassignModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Transfer <strong>{activeStop.customer_name}</strong> ({activeStop.shipment_number}: {activeStop.assigned_qty} x {activeStop.product_name}) to another driver:
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Select Colleague Driver</label>
              <select
                value={targetColleagueId}
                onChange={(e) => setTargetColleagueId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
              >
                {colleagueDrivers.map((driver) => (
                  <option key={driver.id} value={driver.id} disabled={driver.is_current}>
                    {driver.name} {driver.is_current ? '(You)' : ''} - {driver.phone}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Transfer Reason / Instructions</label>
              <input
                type="text"
                value={reassignNotes}
                onChange={(e) => setReassignNotes(e.target.value)}
                placeholder="e.g. Van out of stock, needs 5 jars urgently"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setIsReassignModalOpen(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleReassignOrder}
                className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-extrabold shadow-lg"
              >
                Confirm Transfer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* BOTTOM NAVIGATION BAR (3 TABS) */}
      {/* ======================================================== */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-slate-950/95 backdrop-blur-md border-t border-slate-800/90 z-40 px-3 py-2 flex justify-around items-center">
        {/* Tab 1: Active Orders */}
        <button
          onClick={() => setActiveTab('active')}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all cursor-pointer ${
            activeTab === 'active'
              ? 'text-brand-400 bg-brand-500/10 font-bold'
              : 'text-slate-400 hover:text-slate-200 font-medium'
          }`}
        >
          <div className="relative">
            <Truck className="w-5 h-5" />
            {activeStops.length > 0 && (
              <span className="absolute -top-1 -right-2 bg-brand-500 text-white text-[9px] font-extrabold px-1 rounded-full">
                {activeStops.length}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-1">Active Orders</span>
        </button>

        {/* Tab 2: Completed Shipments */}
        <button
          onClick={() => setActiveTab('completed')}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all cursor-pointer ${
            activeTab === 'completed'
              ? 'text-brand-400 bg-brand-500/10 font-bold'
              : 'text-slate-400 hover:text-slate-200 font-medium'
          }`}
        >
          <div className="relative">
            <CheckCircle2 className="w-5 h-5" />
            {completedShipments.length > 0 && (
              <span className="absolute -top-1 -right-2 bg-emerald-500 text-white text-[9px] font-extrabold px-1 rounded-full">
                {completedShipments.length}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-1">Completed</span>
        </button>

        {/* Tab 3: Profile & Monthly Reports */}
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all cursor-pointer ${
            activeTab === 'profile'
              ? 'text-brand-400 bg-brand-500/10 font-bold'
              : 'text-slate-400 hover:text-slate-200 font-medium'
          }`}
        >
          <div className="relative">
            <UserIcon className="w-5 h-5" />
          </div>
          <span className="text-[10px] mt-1">Profile & Reports</span>
        </button>
      </nav>
    </div>
  );
};
