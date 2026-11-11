import React, { useState, useEffect } from 'react';
import { apiClient } from '@/api/client';
import { 
  Users, 
  Plus, 
  Search, 
  QrCode, 
  FileText, 
  Phone, 
  IndianRupee, 
  Layers,
  MapPin,
  CheckCircle,
  X
} from 'lucide-react';

interface Customer {
  id: string;
  customer_code: string;
  name: string;
  phone: string;
  address: string;
  category: string;
  current_balance: number;
  jar_balance: number;
  credit_limit: number;
  jar_holding_limit: number;
  qr_code_token: string;
  is_active: boolean;
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

export const CustomersPage: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedLedgerCustomer, setSelectedLedgerCustomer] = useState<Customer | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [selectedQRCustomer, setSelectedQRCustomer] = useState<Customer | null>(null);

  // New Customer Form State
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    category: 'residential',
    billing_cycle: 'monthly',
    opening_balance: 0.0,
    credit_limit: 1000.0,
    jar_holding_limit: 5,
  });

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/customers');
      setCustomers(res.data);
    } catch (err) {
      console.error('Failed to load customers', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/customers', formData);
      setIsAddOpen(false);
      setFormData({
        name: '',
        phone: '',
        address: '',
        category: 'residential',
        billing_cycle: 'monthly',
        opening_balance: 0.0,
        credit_limit: 1000.0,
        jar_holding_limit: 5,
      });
      await loadCustomers();
    } catch (err: any) {
      alert(err.response?.data?.detail?.message || err.response?.data?.detail || 'Failed to add customer');
    }
  };

  const openLedgerModal = async (cust: Customer) => {
    setSelectedLedgerCustomer(cust);
    try {
      const res = await apiClient.get(`/customers/${cust.id}/ledger`);
      setLedgerEntries(res.data);
    } catch (err) {
      alert('Failed to load customer account ledger');
    }
  };

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      c.customer_code.toLowerCase().includes(search.toLowerCase()) ||
      c.address.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Customer Accounts & Ledger</h1>
          <p className="text-xs text-slate-500">Manage client directory, individual jar balances, and immutable statements</p>
        </div>
        <button
          onClick={() => setIsAddOpen(true)}
          className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-semibold shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Customer</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, code or address..."
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-brand-500"
          />
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Showing {filteredCustomers.length} of {customers.length} Accounts
        </div>
      </div>

      {/* Customer Directory Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-4">Customer</th>
                <th className="p-4">Contact & Location</th>
                <th className="p-4">Category</th>
                <th className="p-4">Jars Held</th>
                <th className="p-4">Account Balance</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredCustomers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/60 transition">
                  <td className="p-4">
                    <div className="font-semibold text-slate-900">{c.name}</div>
                    <div className="text-[11px] font-mono text-brand-600 font-semibold">{c.customer_code}</div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center space-x-1 text-slate-600">
                      <Phone className="w-3 h-3 text-slate-400" />
                      <span>{c.phone}</span>
                    </div>
                    <div className="flex items-center space-x-1 text-slate-400 text-[11px] mt-0.5 truncate max-w-xs">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{c.address}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                      {c.category}
                    </span>
                  </td>
                  <td className="p-4 font-mono">
                    <span className="font-bold text-slate-900">{c.jar_balance}</span>{' '}
                    <span className="text-[11px] text-slate-400">/ max {c.jar_holding_limit}</span>
                  </td>
                  <td className="p-4 font-mono font-bold">
                    <span className={c.current_balance > 0 ? 'text-rose-600' : 'text-emerald-600'}>
                      ₹{c.current_balance.toLocaleString('en-IN')}
                    </span>
                    <span className="text-[10px] block font-normal text-slate-400">
                      {c.current_balance > 0 ? 'Due from client' : 'Advance Credit'}
                    </span>
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <button
                      onClick={() => openLedgerModal(c)}
                      className="px-2.5 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700 font-semibold text-xs inline-flex items-center space-x-1 transition"
                      title="View Ledger Statement"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Ledger</span>
                    </button>
                    <button
                      onClick={() => setSelectedQRCustomer(c)}
                      className="p-1.5 border border-slate-200 rounded-lg hover:bg-brand-50 hover:text-brand-600 text-slate-600 transition"
                      title="Customer QR Token"
                    >
                      <QrCode className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Customer Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-base text-slate-900">Add New Customer Account</h3>
              <button onClick={() => setIsAddOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Customer / Organization Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="e.g. Metro Heights Apt 304"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Mobile Number *</label>
                  <input
                    type="text"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    placeholder="9876543210"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                  >
                    <option value="residential">Residential</option>
                    <option value="commercial">Commercial / Clinic / Gym</option>
                    <option value="corporate">Corporate Office</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Complete Address *</label>
                <input
                  type="text"
                  required
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="Street, Building, Floor, Zone"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Opening Balance (₹)</label>
                  <input
                    type="number"
                    value={formData.opening_balance}
                    onChange={(e) => setFormData({ ...formData, opening_balance: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Credit Limit (₹)</label>
                  <input
                    type="number"
                    value={formData.credit_limit}
                    onChange={(e) => setFormData({ ...formData, credit_limit: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Max Jar Limit</label>
                  <input
                    type="number"
                    value={formData.jar_holding_limit}
                    onChange={(e) => setFormData({ ...formData, jar_holding_limit: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                >
                  Create Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Ledger Statement Modal */}
      {selectedLedgerCustomer && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  Account Ledger: {selectedLedgerCustomer.name}
                </h3>
                <span className="text-xs text-slate-500 font-mono">
                  {selectedLedgerCustomer.customer_code} • Current Balance: ₹{selectedLedgerCustomer.current_balance}
                </span>
              </div>
              <button
                onClick={() => setSelectedLedgerCustomer(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Description / Type</th>
                    <th className="p-3 text-right">Debit (+)</th>
                    <th className="p-3 text-right">Credit (-)</th>
                    <th className="p-3 text-right">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ledgerEntries.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="p-3 text-slate-500">
                        {new Date(l.transaction_date).toLocaleDateString()}
                      </td>
                      <td className="p-3">
                        <div className="font-medium text-slate-800 capitalize">
                          {l.transaction_type.replace('_', ' ')}
                        </div>
                        <div className="text-[11px] text-slate-400">{l.notes}</div>
                      </td>
                      <td className="p-3 text-right font-mono font-semibold text-rose-600">
                        {l.debit_amount > 0 ? `₹${l.debit_amount.toFixed(2)}` : '-'}
                      </td>
                      <td className="p-3 text-right font-mono font-semibold text-emerald-600">
                        {l.credit_amount > 0 ? `₹${l.credit_amount.toFixed(2)}` : '-'}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">
                        ₹{l.running_balance.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {ledgerEntries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400">
                        No financial transactions recorded for this account yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="pt-3 border-t flex justify-end">
              <button
                onClick={() => setSelectedLedgerCustomer(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800"
              >
                Close Statement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer QR Code Modal */}
      {selectedQRCustomer && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-xs w-full p-6 text-center shadow-2xl border border-slate-100">
            <h3 className="font-bold text-base text-slate-900 mb-1">{selectedQRCustomer.name}</h3>
            <p className="text-xs text-slate-500 mb-4">{selectedQRCustomer.customer_code}</p>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center mb-4">
              {/* Simulated QR Code display */}
              <div className="w-48 h-48 bg-white border border-slate-200 p-2 rounded-xl flex flex-col items-center justify-center">
                <QrCode className="w-32 h-32 text-slate-900" />
                <div className="text-[10px] font-mono text-slate-400 mt-2 truncate max-w-[170px]">
                  {selectedQRCustomer.qr_code_token}
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Driver can scan this sticker code at customer doorstep to immediately verify identity and record delivery.
            </p>

            <button
              onClick={() => setSelectedQRCustomer(null)}
              className="w-full py-2 bg-brand-500 text-white rounded-lg text-xs font-semibold hover:bg-brand-600"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

