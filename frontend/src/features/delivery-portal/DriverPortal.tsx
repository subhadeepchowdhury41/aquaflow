import React, { useState, useEffect } from 'react';
import { apiClient } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Truck, 
  MapPin, 
  Phone, 
  CheckCircle, 
  XCircle, 
  Wifi, 
  WifiOff, 
  RefreshCw,
  QrCode,
  Package,
  IndianRupee,
  LogOut
} from 'lucide-react';

interface Stop {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  product_name: string;
  expected_qty: number;
  status: string;
}

export const DriverPortal: React.FC = () => {
  const { user, logout } = useAuth();
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState<any[]>(() => {
    const saved = localStorage.getItem('aquaflow_driver_offline_queue');
    return saved ? JSON.parse(saved) : [];
  });

  const [activeStop, setActiveStop] = useState<Stop | null>(null);
  const [deliveredQty, setDeliveredQty] = useState(1);
  const [emptyQty, setEmptyQty] = useState(1);
  const [cashCollected, setCashCollected] = useState(0);

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

  const loadStops = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/deliveries/today');
      setStops(res.data);
    } catch (err) {
      console.error('Failed to load driver dispatch', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStops();
  }, []);

  const syncOfflineQueue = async () => {
    const queue = JSON.parse(localStorage.getItem('aquaflow_driver_offline_queue') || '[]');
    if (queue.length === 0) return;

    try {
      await apiClient.post('/deliveries/sync', { actions: queue });
      localStorage.removeItem('aquaflow_driver_offline_queue');
      setOfflineQueue([]);
      alert(`Synchronized ${queue.length} offline deliveries to central plant!`);
      await loadStops();
    } catch (err) {
      console.error('Offline sync failed', err);
    }
  };

  const handleRecordStop = async () => {
    if (!activeStop) return;

    const payload = {
      delivery_task_id: activeStop.id,
      delivered_qty: deliveredQty,
      empty_collected_qty: emptyQty,
      cash_collected: cashCollected,
      payment_mode: cashCollected > 0 ? 'cash' : 'unpaid',
      delivery_status: 'delivered',
      client_tx_id: `offline-tx-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    };

    if (!isOnline) {
      // Save locally to offline queue
      const updatedQueue = [...offlineQueue, payload];
      setOfflineQueue(updatedQueue);
      localStorage.setItem('aquaflow_driver_offline_queue', JSON.stringify(updatedQueue));
      // Mark as completed locally in UI
      setStops(stops.map(s => s.id === activeStop.id ? { ...s, status: 'completed' } : s));
      setActiveStop(null);
      alert('Recorded offline. Stop will auto-sync when connection is restored.');
      return;
    }

    try {
      await apiClient.post('/deliveries/record', payload);
      setActiveStop(null);
      await loadStops();
    } catch (err: any) {
      alert('Failed to log delivery');
    }
  };

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between">
      {/* Driver Header */}
      <header className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-brand-500 rounded-lg text-white">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-sm text-white">AquaFlow Driver</h1>
            <div className="text-[10px] text-slate-400">Mobile Delivery App</div>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
            isOnline ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
          }`}>
            {isOnline ? <Wifi className="w-3 h-3 mr-1" /> : <WifiOff className="w-3 h-3 mr-1" />}
            {isOnline ? 'Online' : 'Offline Mode'}
          </span>
          <button onClick={logout} className="text-slate-400 hover:text-rose-400">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Offline Queue Badge */}
      {offlineQueue.length > 0 && (
        <div className="bg-amber-600 text-white px-4 py-2 text-xs flex justify-between items-center font-medium">
          <span>{offlineQueue.length} offline deliveries pending sync</span>
          {isOnline && (
            <button
              onClick={syncOfflineQueue}
              className="bg-white text-amber-900 px-2 py-0.5 rounded font-bold text-[10px]"
            >
              Sync Now
            </button>
          )}
        </div>
      )}

      {/* Main Delivery Stops Feed */}
      <main className="p-4 space-y-3 flex-1 overflow-y-auto">
        <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
          <span>Today's Route Schedule</span>
          <span>{stops.filter(s => s.status === 'completed').length} / {stops.length} Completed</span>
        </div>

        {stops.map((stop, index) => (
          <div
            key={stop.id}
            className={`p-4 rounded-xl border transition ${
              stop.status === 'completed'
                ? 'bg-slate-950/60 border-slate-800/80 opacity-70'
                : 'bg-slate-950 border-slate-800 shadow-md'
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded mr-2">
                  #{index + 1}
                </span>
                <span className="font-bold text-sm text-white">{stop.customer_name}</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                stop.status === 'completed'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}>
                {stop.status}
              </span>
            </div>

            <div className="space-y-1 text-xs text-slate-400">
              <div className="flex items-center space-x-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                <span className="truncate">{stop.customer_address}</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                <span>{stop.customer_phone}</span>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-800/80 flex justify-between items-center">
              <div className="text-xs text-brand-300 font-semibold">
                {stop.expected_qty} x {stop.product_name}
              </div>

              {stop.status === 'pending' && (
                <button
                  onClick={() => {
                    setActiveStop(stop);
                    setDeliveredQty(stop.expected_qty);
                    setEmptyQty(stop.expected_qty);
                    setCashCollected(0);
                  }}
                  className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-bold shadow-md transition"
                >
                  Deliver Stop
                </button>
              )}
            </div>
          </div>
        ))}
      </main>

      {/* Stop Completion Drawer / Modal */}
      {activeStop && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <div>
                <h3 className="font-bold text-sm text-white">{activeStop.customer_name}</h3>
                <div className="text-xs text-slate-400">{activeStop.product_name}</div>
              </div>
              <button onClick={() => setActiveStop(null)} className="text-slate-400">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                <div className="text-xs text-slate-400 mb-1">Delivered Filled Jars</div>
                <div className="flex items-center justify-center space-x-3">
                  <button
                    onClick={() => setDeliveredQty(Math.max(0, deliveredQty - 1))}
                    className="w-8 h-8 rounded-lg bg-slate-800 text-lg font-bold"
                  >
                    -
                  </button>
                  <span className="text-xl font-bold font-mono text-white">{deliveredQty}</span>
                  <button
                    onClick={() => setDeliveredQty(deliveredQty + 1)}
                    className="w-8 h-8 rounded-lg bg-slate-800 text-lg font-bold"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                <div className="text-xs text-slate-400 mb-1">Empty Jars Collected</div>
                <div className="flex items-center justify-center space-x-3">
                  <button
                    onClick={() => setEmptyQty(Math.max(0, emptyQty - 1))}
                    className="w-8 h-8 rounded-lg bg-slate-800 text-lg font-bold"
                  >
                    -
                  </button>
                  <span className="text-xl font-bold font-mono text-white">{emptyQty}</span>
                  <button
                    onClick={() => setEmptyQty(emptyQty + 1)}
                    className="w-8 h-8 rounded-lg bg-slate-800 text-lg font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Cash Collected (₹ COD)</label>
              <input
                type="number"
                min="0"
                value={cashCollected}
                onChange={(e) => setCashCollected(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white font-mono font-bold"
                placeholder="0.00"
              />
            </div>

            <button
              onClick={handleRecordStop}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-lg transition"
            >
              Confirm Drop-Off & Collect Jars
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

