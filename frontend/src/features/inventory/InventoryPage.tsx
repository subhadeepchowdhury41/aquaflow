import React, { useState, useEffect } from 'react';
import { apiClient } from '@/api/client';
import { 
  Package, 
  Truck, 
  ArrowRightLeft, 
  AlertTriangle, 
  PlusCircle, 
  RefreshCw, 
  Layers,
  ShieldCheck,
  CheckCircle2,
  X
} from 'lucide-react';

interface InventoryItem {
  id: string;
  branch_id: string;
  product_id: string;
  product_name: string;
  filled_warehouse: number;
  empty_warehouse: number;
  filled_transit: number;
  empty_transit: number;
  with_customers: number;
  damaged_qty: number;
  lost_qty: number;
  total_jars: number;
  alert_threshold: number;
}

export const InventoryPage: React.FC = () => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Transfer to vehicle modal
  const [transferModal, setTransferModal] = useState<InventoryItem | null>(null);
  const [transferQty, setTransferQty] = useState(20);

  // Production refill modal
  const [refillModal, setRefillModal] = useState<InventoryItem | null>(null);
  const [refillQty, setRefillQty] = useState(50);

  const loadInventory = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/products/inventory/status');
      setInventory(res.data);
    } catch (err) {
      console.error('Failed to load inventory', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, []);

  const handleTransferToVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferModal) return;

    try {
      await apiClient.post('/products/inventory/transfer-to-vehicle', {
        branch_id: transferModal.branch_id,
        product_id: transferModal.product_id,
        quantity: transferQty,
        source_state: 'filled_warehouse',
        destination_state: 'filled_transit',
        notes: 'Morning driver vehicle dispatch',
      });
      setTransferModal(null);
      await loadInventory();
    } catch (err: any) {
      alert(err.response?.data?.detail?.message || err.response?.data?.detail || 'Transfer failed');
    }
  };

  const handleProductionRefill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refillModal) return;

    try {
      await apiClient.post('/products/inventory/adjust', {
        branch_id: refillModal.branch_id,
        product_id: refillModal.product_id,
        transaction_type: 'production_fill',
        quantity: refillQty,
        target_state: 'filled_warehouse',
        notes: 'RO Plant batch purification fill',
      });
      setRefillModal(null);
      await loadInventory();
    } catch (err: any) {
      alert('Production refill failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Returnable Jar Inventory & Circulation</h1>
          <p className="text-xs text-slate-500">
            Real-time 8-state tracking across plant warehouse, driver transit vehicles, and customers
          </p>
        </div>
        <button
          onClick={loadInventory}
          className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* 8-State Breakdown Cards for each container */}
      {inventory.map((item) => (
        <div key={item.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center space-x-2">
                <Package className="w-5 h-5 text-brand-600" />
                <h3 className="font-bold text-base text-slate-900">{item.product_name}</h3>
              </div>
              <span className="text-xs text-slate-400">Total Asset Pool: {item.total_jars} Containers</span>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => { setRefillModal(item); setRefillQty(30); }}
                className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 transition"
              >
                + RO Plant Fill
              </button>
              <button
                onClick={() => { setTransferModal(item); setTransferQty(20); }}
                className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-semibold shadow-sm transition inline-flex items-center space-x-1"
              >
                <Truck className="w-3.5 h-3.5" />
                <span>Dispatch to Vehicle</span>
              </button>
            </div>
          </div>

          {/* 8 State Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {/* 1. Warehouse Filled */}
            <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3.5">
              <div className="text-[11px] font-semibold text-emerald-800">Warehouse Filled</div>
              <div className="mt-1 text-xl font-bold text-emerald-900">{item.filled_warehouse}</div>
              <div className="text-[10px] text-emerald-600 mt-0.5">Ready for dispatch</div>
            </div>

            {/* 2. Warehouse Empty */}
            <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3.5">
              <div className="text-[11px] font-semibold text-amber-800">Warehouse Empty</div>
              <div className="mt-1 text-xl font-bold text-amber-900">{item.empty_warehouse}</div>
              <div className="text-[10px] text-amber-600 mt-0.5">Awaiting cleaning/refill</div>
            </div>

            {/* 3. In Transit Filled */}
            <div className="bg-sky-50/60 border border-sky-100 rounded-xl p-3.5">
              <div className="text-[11px] font-semibold text-sky-800">Transit (Filled)</div>
              <div className="mt-1 text-xl font-bold text-sky-900">{item.filled_transit}</div>
              <div className="text-[10px] text-sky-600 mt-0.5">On delivery vehicle</div>
            </div>

            {/* 4. In Transit Empty */}
            <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3.5">
              <div className="text-[11px] font-semibold text-indigo-800">Transit (Empty)</div>
              <div className="mt-1 text-xl font-bold text-indigo-900">{item.empty_transit}</div>
              <div className="text-[10px] text-indigo-600 mt-0.5">Collected from doorstep</div>
            </div>

            {/* 5. With Customers */}
            <div className="bg-purple-50/60 border border-purple-100 rounded-xl p-3.5">
              <div className="text-[11px] font-semibold text-purple-800">With Customers</div>
              <div className="mt-1 text-xl font-bold text-purple-900">{item.with_customers}</div>
              <div className="text-[10px] text-purple-600 mt-0.5">Active with clients</div>
            </div>

            {/* 6. Damaged */}
            <div className="bg-rose-50/60 border border-rose-100 rounded-xl p-3.5">
              <div className="text-[11px] font-semibold text-rose-800">Damaged</div>
              <div className="mt-1 text-xl font-bold text-rose-900">{item.damaged_qty}</div>
              <div className="text-[10px] text-rose-600 mt-0.5">Cracked / discarded</div>
            </div>

            {/* 7. Lost */}
            <div className="bg-slate-100 border border-slate-200 rounded-xl p-3.5">
              <div className="text-[11px] font-semibold text-slate-700">Lost Containers</div>
              <div className="mt-1 text-xl font-bold text-slate-900">{item.lost_qty}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Unreturned balance</div>
            </div>
          </div>
        </div>
      ))}

      {/* Dispatch to Vehicle Modal */}
      {transferModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100">
            <h3 className="font-bold text-base text-slate-900 mb-1">Load Jars to Driver Vehicle</h3>
            <p className="text-xs text-slate-500 mb-4">
              Transfers filled jars from Plant Warehouse ({transferModal.filled_warehouse} available) to Driver Transit.
            </p>
            <form onSubmit={handleTransferToVehicle} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Quantity of Jars to Load</label>
                <input
                  type="number"
                  min="1"
                  max={transferModal.filled_warehouse}
                  required
                  value={transferQty}
                  onChange={(e) => setTransferQty(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-semibold"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTransferModal(null)}
                  className="px-4 py-2 border rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                >
                  Confirm Vehicle Load
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Production Refill Modal */}
      {refillModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100">
            <h3 className="font-bold text-base text-slate-900 mb-1">RO Plant Production Refill</h3>
            <p className="text-xs text-slate-500 mb-4">
              Converts empty jars ({refillModal.empty_warehouse} available) into purified filled jars ready for sale.
            </p>
            <form onSubmit={handleProductionRefill} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Batch Refill Quantity</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={refillQty}
                  onChange={(e) => setRefillQty(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border rounded-lg text-sm font-semibold"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRefillModal(null)}
                  className="px-4 py-2 border rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                >
                  Record Batch Refill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

