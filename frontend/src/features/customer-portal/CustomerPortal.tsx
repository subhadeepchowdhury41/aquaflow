import React, { useState, useEffect } from 'react';
import { apiClient } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Droplet,
  Truck,
  Receipt,
  MessageSquarePlus,
  Clock,
  CheckCircle2,
  AlertCircle,
  QrCode,
  LogOut,
  PlusCircle,
  PauseCircle,
  IndianRupee,
  Phone,
  MapPin,
  Calendar,
  X,
  CreditCard,
  ChevronRight,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownLeft,
  Sparkles,
  HelpCircle,
  Layers,
  FileText
} from 'lucide-react';

interface SupplierInfo {
  name: string;
  phone: string;
  email: string;
  address?: string;
  gstin?: string;
}

interface ProfileData {
  id: string;
  customer_code: string;
  name: string;
  phone: string;
  email?: string;
  address: string;
  category: string;
  current_balance: number;
  jar_balance: number;
  jar_holding_limit: number;
  credit_limit: number;
  qr_code_token: string;
  active_subscriptions: number;
  supplier: SupplierInfo;
}

interface TimelineStep {
  step: string;
  status: 'completed' | 'current' | 'pending' | 'failed';
  time?: string | null;
  description?: string;
}

interface DeliveryOrder {
  id: string;
  scheduled_date: string;
  shift: string;
  product_name: string;
  product_unit: string;
  expected_qty: number;
  status: string;
  driver_name: string;
  driver_phone?: string;
  record?: {
    delivered_qty: number;
    empty_collected_qty: number;
    cash_collected: number;
    payment_mode: string;
    delivered_at?: string;
    notes?: string;
    failure_reason?: string;
  };
  timeline: TimelineStep[];
}

interface LedgerTx {
  id: string;
  transaction_date: string;
  transaction_type: string;
  debit_amount: number;
  credit_amount: number;
  running_balance: number;
  notes?: string;
  reference_type?: string;
}

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  tax_amount: number;
  total_amount: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  billing_period_start: string;
  billing_period_end: string;
  due_date: string;
  subtotal: number;
  total_tax: number;
  total_amount: number;
  paid_amount: number;
  balance_due: number;
  status: string;
  items: InvoiceItem[];
}

interface ServiceTicket {
  id: string;
  title: string;
  description: string;
  status: string;
  resolution_notes?: string;
  created_at: string;
  timeline: TimelineStep[];
}

export const CustomerPortal: React.FC = () => {
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'orders' | 'dues' | 'requests'>('orders');
  
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryOrder[]>([]);
  const [ledgerData, setLedgerData] = useState<{ current_balance: number; jar_balance: number; transactions: LedgerTx[] }>({
    current_balance: 0,
    jar_balance: 0,
    transactions: []
  });
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<ServiceTicket | null>(null);
  const [isOrderExtraOpen, setIsOrderExtraOpen] = useState(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isPayDuesOpen, setIsPayDuesOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  // Extra Order Form
  const [extraQuantity, setExtraQuantity] = useState(2);
  const [extraDate, setExtraDate] = useState(() => {
    const today = new Date();
    today.setDate(today.getDate() + 1);
    return today.toISOString().split('T')[0];
  });
  const [extraShift, setExtraShift] = useState('morning');
  const [extraNotes, setExtraNotes] = useState('');

  // Service Request Form
  const [requestCategory, setRequestCategory] = useState('extra_water');
  const [requestTitle, setRequestTitle] = useState('');
  const [requestDesc, setRequestDesc] = useState('');

  // Payment Form
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState('upi');

  const fetchPortalData = async () => {
    try {
      setLoading(true);
      const [profRes, delivRes, ledgerRes, invRes, reqRes] = await Promise.all([
        apiClient.get('/portal/me'),
        apiClient.get('/portal/deliveries'),
        apiClient.get('/portal/ledger'),
        apiClient.get('/portal/invoices'),
        apiClient.get('/portal/requests')
      ]);

      setProfile(profRes.data);
      setDeliveries(delivRes.data);
      setLedgerData(ledgerRes.data);
      setInvoices(invRes.data);
      setTickets(reqRes.data);
      if (profRes.data.current_balance > 0) {
        setPayAmount(profRes.data.current_balance);
      }
    } catch (err) {
      console.error('Failed to load portal data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPortalData();
  }, []);

  const handleOrderExtra = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/portal/order-extra', {
        quantity: extraQuantity,
        delivery_date: extraDate,
        shift: extraShift,
        notes: extraNotes,
      });
      setIsOrderExtraOpen(false);
      setExtraNotes('');
      alert(`Order confirmed! ${extraQuantity} water jars scheduled for ${extraDate}.`);
      await fetchPortalData();
    } catch (err: any) {
      alert(err.response?.data?.detail?.message || 'Failed to place extra order');
    }
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/portal/request', {
        category: requestCategory,
        title: requestTitle,
        description: requestDesc,
      });
      setIsRequestModalOpen(false);
      setRequestTitle('');
      setRequestDesc('');
      alert('Request submitted! Your water agency supervisor has been notified.');
      await fetchPortalData();
    } catch (err: any) {
      alert(err.response?.data?.detail?.message || 'Failed to submit request');
    }
  };

  const handlePayDues = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiClient.post('/portal/pay', {
        amount: payAmount,
        payment_method: payMethod,
      });
      setIsPayDuesOpen(false);
      alert(res.data.message || 'Payment successfully credited to your ledger!');
      await fetchPortalData();
    } catch (err: any) {
      alert('Payment processing failed');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col pb-16">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-brand-500 p-2 rounded-xl text-white shadow-md shadow-brand-500/20">
              <Droplet className="w-5 h-5" />
            </div>
            <div>
              <div className="font-extrabold text-base text-slate-900 tracking-tight flex items-center space-x-2">
                <span>{profile?.name || 'Customer Account'}</span>
                <span className="text-[10px] bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-mono font-bold border border-brand-200">
                  {profile?.customer_code}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 truncate max-w-xs">
                Supplied by: <strong className="text-slate-700">{profile?.supplier?.name}</strong>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsQrModalOpen(true)}
              className="p-2 text-slate-600 hover:text-brand-600 hover:bg-slate-100 rounded-lg transition"
              title="View Delivery Sticker QR"
            >
              <QrCode className="w-5 h-5" />
            </button>
            <button
              onClick={logout}
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 w-full space-y-6 flex-1">
        {/* Profile & KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Account Due Balance */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center text-xs font-semibold text-slate-500">
                <span>Account Balance</span>
                <IndianRupee className="w-4 h-4 text-slate-400" />
              </div>
              <div className={`mt-2 text-2xl font-extrabold font-mono ${
                (profile?.current_balance || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'
              }`}>
                ₹{profile?.current_balance?.toFixed(2) || '0.00'}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {(profile?.current_balance || 0) > 0 ? 'Total outstanding due' : 'Account in good standing'}
              </div>
            </div>

            {(profile?.current_balance || 0) > 0 && (
              <button
                onClick={() => setIsPayDuesOpen(true)}
                className="mt-4 w-full py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-sm transition"
              >
                Pay Dues Online
              </button>
            )}
          </div>

          {/* 2. Jar Holding Balance */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center text-xs font-semibold text-slate-500">
                <span>Empty Jars in Hand</span>
                <Layers className="w-4 h-4 text-brand-500" />
              </div>
              <div className="mt-2 text-2xl font-extrabold font-mono text-brand-600">
                {profile?.jar_balance || 0}{' '}
                <span className="text-xs font-normal text-slate-400">/ max {profile?.jar_holding_limit || 5}</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Hand over to delivery executive on arrival
              </div>
            </div>
            <button
              onClick={() => setIsOrderExtraOpen(true)}
              className="mt-4 w-full py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Order Extra Jars</span>
            </button>
          </div>

          {/* 3. Daily Subscriptions */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center text-xs font-semibold text-slate-500">
                <span>Recurring Subscription</span>
                <Clock className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="mt-2 text-2xl font-extrabold text-slate-900">
                {profile?.active_subscriptions || 1}{' '}
                <span className="text-xs font-semibold text-emerald-600">Active Daily</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">Scheduled morning drop-offs</div>
            </div>
            <button
              onClick={() => {
                setRequestCategory('vacation_pause');
                setRequestTitle('Vacation Delivery Pause');
                setRequestDesc('Please pause deliveries while I am away on vacation.');
                setIsRequestModalOpen(true);
              }}
              className="mt-4 w-full py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition"
            >
              Vacation Pause
            </button>
          </div>

          {/* 4. Plant Contact & Support */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center text-xs font-semibold text-slate-500">
                <span>Direct Supplier Line</span>
                <Phone className="w-4 h-4 text-indigo-500" />
              </div>
              <div className="mt-2 text-sm font-bold text-slate-900 truncate">
                {profile?.supplier?.name}
              </div>
              <div className="text-xs text-slate-600 font-mono mt-0.5">{profile?.supplier?.phone || 'Plant Helpline'}</div>
            </div>
            <button
              onClick={() => {
                setRequestCategory('jar_leakage');
                setRequestTitle('Quality / Service Request');
                setRequestDesc('');
                setIsRequestModalOpen(true);
              }}
              className="mt-4 w-full py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              <span>Raise Ticket</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation Controls (Responsive) */}
        <div className="flex border-b border-slate-200 space-x-2 sm:space-x-8 text-sm font-semibold">
          <button
            onClick={() => setActiveTab('orders')}
            className={`pb-3 border-b-2 flex items-center space-x-2 transition ${
              activeTab === 'orders'
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>Orders & Deliveries</span>
            <span className="ml-1 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
              {deliveries.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('dues')}
            className={`pb-3 border-b-2 flex items-center space-x-2 transition ${
              activeTab === 'dues'
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Payments & Due History</span>
            <span className="ml-1 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
              {ledgerData.transactions.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('requests')}
            className={`pb-3 border-b-2 flex items-center space-x-2 transition ${
              activeTab === 'requests'
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <MessageSquarePlus className="w-4 h-4" />
            <span>Raise & Track Requests</span>
            <span className="ml-1 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
              {tickets.length}
            </span>
          </button>
        </div>

        {/* TAB 1: ORDERS & DELIVERIES WITH TIMELINE */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base text-slate-900">Delivery Orders History</h3>
                <p className="text-xs text-slate-500">Inspect order lifecycle, delivery timestamps, and jar collections</p>
              </div>
              <button
                onClick={() => setIsOrderExtraOpen(true)}
                className="px-3.5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center space-x-1.5"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Order Extra Jars</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {deliveries.map((order) => (
                <div
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:border-brand-300 hover:shadow-md transition cursor-pointer space-y-3"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-xs font-bold text-slate-900 flex items-center space-x-2">
                        <span>{order.product_name}</span>
                        <span className="text-xs text-brand-600 font-mono">({order.expected_qty} Jars)</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 flex items-center space-x-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{new Date(order.scheduled_date).toLocaleDateString()}</span>
                        <span>•</span>
                        <span className="capitalize">{order.shift} Shift</span>
                      </div>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      order.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-800'
                        : order.status === 'pending'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}>
                      {order.status}
                    </span>
                  </div>

                  {/* Summary row */}
                  <div className="bg-slate-50 rounded-xl p-3 text-xs flex justify-between items-center text-slate-600">
                    <div>
                      <span className="text-slate-400">Driver:</span>{' '}
                      <strong className="text-slate-700">{order.driver_name}</strong>
                    </div>
                    {order.record && (
                      <div className="font-mono text-emerald-700 font-semibold">
                        Delivered: {order.record.delivered_qty} | Empty: {order.record.empty_collected_qty}
                      </div>
                    )}
                  </div>

                  {/* Timeline Preview (Mini Stepper) */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <span className="text-[11px] font-medium text-brand-600 flex items-center">
                      View Order Timeline <ChevronRight className="w-3.5 h-3.5 ml-1" />
                    </span>
                    {order.record?.cash_collected ? (
                      <span className="text-slate-900 font-bold font-mono">
                        Paid ₹{order.record.cash_collected.toFixed(2)}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}

              {deliveries.length === 0 && (
                <div className="col-span-2 bg-white rounded-2xl border p-12 text-center text-slate-400">
                  <Truck className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                  <p className="text-sm font-semibold">No delivery orders on record</p>
                  <p className="text-xs text-slate-400 mt-1">Daily subscriptions and extra water orders will show here.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: PAYMENTS & DUE HISTORY */}
        {activeTab === 'dues' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="font-bold text-base text-slate-900">Ledger Statement & Dues History</h3>
                <p className="text-xs text-slate-500">Audit trail of delivery charges, payment receipts, and balance changes</p>
              </div>
              <button
                onClick={() => setIsPayDuesOpen(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center space-x-1.5"
              >
                <CreditCard className="w-4 h-4" />
                <span>Pay Outstanding Dues</span>
              </button>
            </div>

            {/* Invoices Overview */}
            {invoices.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400">
                  Monthly GST Tax Invoices
                </h4>
                <div className="divide-y divide-slate-100">
                  {invoices.map((inv) => (
                    <div
                      key={inv.id}
                      onClick={() => setSelectedInvoice(inv)}
                      className="py-3 flex justify-between items-center text-xs hover:bg-slate-50 px-2 rounded-lg cursor-pointer transition"
                    >
                      <div>
                        <div className="font-bold text-slate-900 font-mono">{inv.invoice_number}</div>
                        <div className="text-[11px] text-slate-400">
                          Period: {new Date(inv.billing_period_start).toLocaleDateString()} to {new Date(inv.billing_period_end).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <div className="font-bold text-slate-900 font-mono">₹{inv.total_amount.toFixed(2)}</div>
                          <div className="text-[10px] text-slate-400">Due: ₹{inv.balance_due.toFixed(2)}</div>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          inv.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {inv.status}
                        </span>
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Immutable Account Ledger Table */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <span className="font-bold text-xs text-slate-700">Detailed Transaction Ledger</span>
                <span className="text-xs font-mono font-bold text-slate-900">
                  Net Balance: ₹{ledgerData.current_balance.toFixed(2)}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b">
                    <tr>
                      <th className="p-4">Date</th>
                      <th className="p-4">Transaction / Description</th>
                      <th className="p-4 text-right">Debit Charge (+)</th>
                      <th className="p-4 text-right">Payment Credit (-)</th>
                      <th className="p-4 text-right">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ledgerData.transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/70 transition">
                        <td className="p-4 text-slate-500 whitespace-nowrap">
                          {new Date(tx.transaction_date).toLocaleDateString()}
                        </td>
                        <td className="p-4">
                          <div className="font-bold text-slate-800 capitalize flex items-center space-x-1.5">
                            {tx.debit_amount > 0 ? (
                              <ArrowUpRight className="w-3.5 h-3.5 text-rose-500" />
                            ) : (
                              <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500" />
                            )}
                            <span>{tx.transaction_type.replace('_', ' ')}</span>
                          </div>
                          <div className="text-[11px] text-slate-400">{tx.notes}</div>
                        </td>
                        <td className="p-4 text-right font-mono font-semibold text-rose-600">
                          {tx.debit_amount > 0 ? `+₹${tx.debit_amount.toFixed(2)}` : '-'}
                        </td>
                        <td className="p-4 text-right font-mono font-semibold text-emerald-600">
                          {tx.credit_amount > 0 ? `-₹${tx.credit_amount.toFixed(2)}` : '-'}
                        </td>
                        <td className="p-4 text-right font-mono font-bold text-slate-900">
                          ₹{tx.running_balance.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {ledgerData.transactions.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-400">
                          No ledger transactions on record.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: RAISE & TRACK REQUESTS */}
        {activeTab === 'requests' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base text-slate-900">Tracked Requests & Support Tickets</h3>
                <p className="text-xs text-slate-500">Live progress tracking from submission to dispatcher resolution</p>
              </div>
              <button
                onClick={() => setIsRequestModalOpen(true)}
                className="px-3.5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center space-x-1.5"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Raise New Request</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tickets.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedTicket(t)}
                  className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:border-brand-300 hover:shadow-md transition cursor-pointer space-y-3"
                >
                  <div className="flex justify-between items-start">
                    <h4 className="font-bold text-sm text-slate-900">{t.title}</h4>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      t.status === 'resolved' || t.status === 'closed'
                        ? 'bg-emerald-100 text-emerald-800'
                        : t.status === 'in_progress'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {t.status.replace('_', ' ')}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-2">{t.description}</p>

                  <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400">
                    <span>Submitted: {new Date(t.created_at).toLocaleDateString()}</span>
                    <span className="text-brand-600 font-semibold flex items-center">
                      View Progress <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                    </span>
                  </div>
                </div>
              ))}

              {tickets.length === 0 && (
                <div className="col-span-2 bg-white rounded-2xl border p-12 text-center text-slate-400">
                  <MessageSquarePlus className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                  <p className="text-sm font-semibold">No support requests active</p>
                  <p className="text-xs text-slate-400 mt-1">Need a vacation pause, bottle replacement, or billing query? Click above to raise a request.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ================= MODALS & DRAWERS ================= */}

      {/* 1. ORDER DETAILS & TIMELINE MODAL */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex justify-between items-start pb-3 border-b">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-600">
                  Order Details & Timeline
                </span>
                <h3 className="font-extrabold text-base text-slate-900 mt-0.5">
                  {selectedOrder.expected_qty} x {selectedOrder.product_name}
                </h3>
                <div className="text-xs text-slate-500">
                  Scheduled: {new Date(selectedOrder.scheduled_date).toLocaleDateString()} ({selectedOrder.shift} shift)
                </div>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stepper Timeline */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                Fulfillment Lifecycle
              </h4>
              <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {selectedOrder.timeline.map((step, idx) => (
                  <div key={idx} className="relative">
                    <span className={`absolute -left-6 top-0.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${
                      step.status === 'completed'
                        ? 'bg-emerald-500'
                        : step.status === 'current'
                        ? 'bg-brand-500 animate-pulse'
                        : step.status === 'failed'
                        ? 'bg-rose-500'
                        : 'bg-slate-300'
                    }`} />
                    <div className="font-bold text-xs text-slate-900">{step.step}</div>
                    <div className="text-[11px] text-slate-500">{step.description}</div>
                    {step.time && (
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {new Date(step.time).toLocaleString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Stop Proof Details */}
            {selectedOrder.record && (
              <div className="bg-slate-50 p-4 rounded-xl space-y-2 text-xs border border-slate-100">
                <div className="font-bold text-slate-800">Delivered Stop Confirmation</div>
                <div className="grid grid-cols-2 gap-2 text-slate-600">
                  <div>Delivered Filled Jars: <strong className="text-slate-900">{selectedOrder.record.delivered_qty}</strong></div>
                  <div>Empty Collected: <strong className="text-slate-900">{selectedOrder.record.empty_collected_qty}</strong></div>
                  <div>Payment Mode: <strong className="text-slate-900 capitalize">{selectedOrder.record.payment_mode}</strong></div>
                  <div>Cash Collected: <strong className="text-slate-900">₹{selectedOrder.record.cash_collected.toFixed(2)}</strong></div>
                </div>
                {selectedOrder.record.notes && (
                  <div className="text-slate-500 text-[11px] pt-1 border-t">
                    Remarks: "{selectedOrder.record.notes}"
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setSelectedOrder(null)}
              className="w-full py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* 2. ORDER EXTRA WATER MODAL */}
      {isOrderExtraOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b">
              <h3 className="font-bold text-base text-slate-900">Order Extra Water Jars</h3>
              <button onClick={() => setIsOrderExtraOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleOrderExtra} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Number of 20L Jars</label>
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => setExtraQuantity(Math.max(1, extraQuantity - 1))}
                    className="w-9 h-9 rounded-lg border border-slate-200 bg-slate-50 font-bold text-slate-700"
                  >
                    -
                  </button>
                  <span className="text-lg font-bold font-mono text-slate-900">{extraQuantity} Jars</span>
                  <button
                    type="button"
                    onClick={() => setExtraQuantity(extraQuantity + 1)}
                    className="w-9 h-9 rounded-lg border border-slate-200 bg-slate-50 font-bold text-slate-700"
                  >
                    +
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Preferred Delivery Date</label>
                <input
                  type="date"
                  required
                  value={extraDate}
                  onChange={(e) => setExtraDate(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Preferred Delivery Shift</label>
                <select
                  value={extraShift}
                  onChange={(e) => setExtraShift(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  <option value="morning">Morning Shift (06:00 AM - 10:00 AM)</option>
                  <option value="afternoon">Afternoon Shift (11:00 AM - 02:00 PM)</option>
                  <option value="evening">Evening Shift (04:00 PM - 08:00 PM)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Special Drop-off Note (Optional)</label>
                <input
                  type="text"
                  value={extraNotes}
                  onChange={(e) => setExtraNotes(e.target.value)}
                  placeholder="e.g. Leave with security guard"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOrderExtraOpen(false)}
                  className="px-4 py-2 border rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-bold shadow-sm"
                >
                  Confirm Extra Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. RAISE SERVICE / COMPLAINT TICKET MODAL */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b">
              <h3 className="font-bold text-base text-slate-900">Raise Request or Report Issue</h3>
              <button onClick={() => setIsRequestModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmitRequest} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Request Category</label>
                <select
                  value={requestCategory}
                  onChange={(e) => setRequestCategory(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  <option value="extra_water">Urgent Extra Water Needed</option>
                  <option value="vacation_pause">Vacation Schedule Pause</option>
                  <option value="jar_leakage">Jar Leakage / Damaged Container</option>
                  <option value="damaged_seal">Cap Seal Broken / Quality Concern</option>
                  <option value="timing_issue">Delivery Delayed / Shift Change</option>
                  <option value="billing_inquiry">Invoice or Ledger Balance Query</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Subject / Summary</label>
                <input
                  type="text"
                  required
                  value={requestTitle}
                  onChange={(e) => setRequestTitle(e.target.value)}
                  placeholder="Brief summary of request..."
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Details & Description</label>
                <textarea
                  rows={3}
                  required
                  value={requestDesc}
                  onChange={(e) => setRequestDesc(e.target.value)}
                  placeholder="Explain any details for the plant dispatcher..."
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRequestModalOpen(false)}
                  className="px-4 py-2 border rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-bold shadow-sm"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. TICKET TRACKING TIMELINE MODAL */}
      {selectedTicket && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-start pb-2 border-b">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-600">
                  Request Tracker
                </span>
                <h3 className="font-bold text-sm text-slate-900 mt-0.5">{selectedTicket.title}</h3>
              </div>
              <button onClick={() => setSelectedTicket(null)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border">
              {selectedTicket.description}
            </p>

            {/* Stepper */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Status Progress</h4>
              <div className="relative pl-6 space-y-5 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {selectedTicket.timeline.map((step, idx) => (
                  <div key={idx} className="relative">
                    <span className={`absolute -left-6 top-0.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${
                      step.status === 'completed'
                        ? 'bg-emerald-500'
                        : 'bg-slate-300'
                    }`} />
                    <div className="font-bold text-xs text-slate-900">{step.step}</div>
                    <div className="text-[11px] text-slate-500">{step.description}</div>
                    {step.time && (
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {new Date(step.time).toLocaleString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setSelectedTicket(null)}
              className="w-full py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* 5. PAY DUES ONLINE MODAL */}
      {isPayDuesOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b">
              <h3 className="font-bold text-base text-slate-900">Pay Outstanding Dues</h3>
              <button onClick={() => setIsPayDuesOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handlePayDues} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Amount to Pay (₹)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    min="1"
                    required
                    value={payAmount}
                    onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)}
                    className="w-full pl-8 pr-3 py-2 border rounded-lg text-sm font-bold font-mono text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Select Payment Method</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setPayMethod('upi')}
                    className={`p-2.5 border rounded-xl text-center font-semibold transition ${
                      payMethod === 'upi' ? 'border-brand-500 bg-brand-50/50 text-brand-700' : 'border-slate-200'
                    }`}
                  >
                    UPI / QR Code
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayMethod('card')}
                    className={`p-2.5 border rounded-xl text-center font-semibold transition ${
                      payMethod === 'card' ? 'border-brand-500 bg-brand-50/50 text-brand-700' : 'border-slate-200'
                    }`}
                  >
                    Debit / Credit Card
                  </button>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border text-center text-xs text-slate-500">
                Payment reconciles instantly with your water supplier ledger.
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition"
              >
                Pay ₹{payAmount.toFixed(2)} & Reconcile Account
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 6. INVOICE RECEIPT MODAL */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-start pb-2 border-b">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tax Invoice Receipt</span>
                <h3 className="font-extrabold text-base text-slate-900 font-mono">{selectedInvoice.invoice_number}</h3>
              </div>
              <button onClick={() => setSelectedInvoice(null)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Billing Period:</span>
                <strong className="text-slate-800">
                  {new Date(selectedInvoice.billing_period_start).toLocaleDateString()} - {new Date(selectedInvoice.billing_period_end).toLocaleDateString()}
                </strong>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Due Date:</span>
                <strong className="text-slate-800">{new Date(selectedInvoice.due_date).toLocaleDateString()}</strong>
              </div>
            </div>

            {/* Line Items */}
            <div className="border-t border-b py-2 space-y-1.5 text-xs">
              {selectedInvoice.items?.map((it, idx) => (
                <div key={idx} className="flex justify-between">
                  <span className="text-slate-700">{it.description}</span>
                  <span className="font-mono text-slate-900 font-semibold">₹{it.total_amount.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Subtotal:</span>
                <span className="font-mono">₹{selectedInvoice.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>GST Tax:</span>
                <span className="font-mono">₹{selectedInvoice.total_tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-slate-900 pt-1 border-t">
                <span>Total Amount:</span>
                <span className="font-mono">₹{selectedInvoice.total_amount.toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={() => setSelectedInvoice(null)}
              className="w-full py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* 7. CUSTOMER QR CODE MODAL */}
      {isQrModalOpen && profile && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-xs w-full p-6 text-center shadow-2xl border border-slate-100 space-y-3">
            <h3 className="font-bold text-base text-slate-900">{profile.name}</h3>
            <p className="text-xs text-slate-500 font-mono">{profile.customer_code}</p>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col items-center justify-center">
              <div className="w-44 h-44 bg-white border border-slate-200 p-2 rounded-xl flex flex-col items-center justify-center">
                <QrCode className="w-32 h-32 text-slate-900" />
                <div className="text-[10px] font-mono text-slate-400 mt-2 truncate max-w-[150px]">
                  {profile.qr_code_token}
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              Print or show this sticker code at your entrance for instant driver delivery check-in.
            </p>

            <button
              onClick={() => setIsQrModalOpen(false)}
              className="w-full py-2 bg-brand-500 text-white rounded-lg text-xs font-bold"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
