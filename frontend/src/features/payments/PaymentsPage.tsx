import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/api/client';
import {
  IndianRupee,
  Search,
  RefreshCw,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Filter,
  Receipt,
  Calendar,
  RotateCcw
} from 'lucide-react';

interface UniversalPayment {
  id: string;
  payment_number: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  payment_ref_id?: string;
  payment_stage: string;
  status: string;
  notes?: string;
  customer_id: string;
  customer_name: string;
  customer_phone?: string;
  invoice_id?: string;
  invoice_number?: string;
  order_id?: string;
  order_number?: string;
  order_status?: string;
  order_expected_qty?: number;
  order_product_name?: string;
  order_scheduled_date?: string;
  collector_name?: string;
}

const STAGE_BADGE: Record<string, { label: string; cls: string }> = {
  while_order: { label: 'While Ordering', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  while_delivery: { label: 'While Delivery', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  later: { label: 'Later Collection', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
};

export const PaymentsPage: React.FC = () => {
  const navigate = useNavigate();

  const [items, setItems] = useState<UniversalPayment[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalAmountFiltered, setTotalAmountFiltered] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters & Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [search, setSearch] = useState('');
  const [paymentStage, setPaymentStage] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadPayments = async (targetPage = page) => {
    try {
      setLoading(true);
      const params: Record<string, any> = {
        page: targetPage,
        page_size: pageSize,
      };
      if (search.trim()) params.search = search.trim();
      if (paymentStage) params.payment_stage = paymentStage;
      if (paymentMethod) params.payment_method = paymentMethod;
      if (statusFilter) params.status = statusFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const res = await apiClient.get('/invoices/payments/universal', { params });
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
      setTotalPages(res.data.total_pages || 1);
      setTotalAmountFiltered(res.data.total_amount_filtered || 0);
    } catch (err) {
      console.error('Failed to load universal payments', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments(page);
  }, [page, pageSize, paymentStage, paymentMethod, statusFilter, dateFrom, dateTo]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadPayments(1);
  };

  const resetFilters = () => {
    setSearch('');
    setPaymentStage('');
    setPaymentMethod('');
    setStatusFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const startIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(total, page * pageSize);

  return (
    <div className="space-y-5">
      {/* Header & Summary KPIs */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Universal Payments Directory</h1>
          <p className="text-xs text-slate-500 mt-1">
            Audit all payments across ordering, doorstep deliveries, and account settlements — jump directly to any linked order
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl text-right">
            <div className="text-[10px] uppercase font-bold text-slate-400">Matching Receipts</div>
            <div className="text-base font-extrabold font-mono text-slate-900">{total}</div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl text-right">
            <div className="text-[10px] uppercase font-bold text-emerald-700">Filtered Total</div>
            <div className="text-base font-extrabold font-mono text-emerald-800">
              ₹{totalAmountFiltered.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <button
            onClick={() => loadPayments(page)}
            className="p-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition"
            title="Refresh Payments"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search receipt #, UTR/ref, customer, phone, order #..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-20 py-2 text-xs text-slate-800 focus:outline-none focus:border-brand-500"
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1.5 px-3 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-[11px] font-bold"
            >
              Search
            </button>
          </form>

          <div className="flex items-center space-x-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={paymentStage}
              onChange={(e) => {
                setPaymentStage(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-700"
            >
              <option value="">All Stages</option>
              <option value="while_order">While Ordering</option>
              <option value="while_delivery">While Delivery</option>
              <option value="later">Later Collection</option>
            </select>
          </div>

          <select
            value={paymentMethod}
            onChange={(e) => {
              setPaymentMethod(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-700"
          >
            <option value="">All Methods</option>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="razorpay">Razorpay</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="cheque">Cheque</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-700"
          >
            <option value="">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>

          <div className="flex items-center space-x-1.5 text-xs text-slate-600">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs"
              title="From Date"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs"
              title="To Date"
            />
          </div>

          <button
            onClick={resetFilters}
            className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold inline-flex items-center space-x-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-4">Receipt &amp; Date</th>
                <th className="p-4">Customer</th>
                <th className="p-4">Stage &amp; Method</th>
                <th className="p-4 text-right">Amount</th>
                <th className="p-4">Linked Order / Invoice</th>
                <th className="p-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {items.map((p) => {
                const stg = STAGE_BADGE[p.payment_stage] || STAGE_BADGE.later;
                return (
                  <tr key={p.id} className="hover:bg-slate-50/70 transition">
                    <td className="p-4">
                      <div className="font-mono font-bold text-slate-900">{p.payment_number}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {new Date(p.payment_date).toLocaleString()}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-slate-900">{p.customer_name}</div>
                      <div className="text-[11px] text-slate-500">{p.customer_phone || '—'}</div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${stg.cls}`}>
                          {stg.label}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-bold uppercase">
                          {p.payment_method}
                        </span>
                      </div>
                      {p.payment_ref_id && (
                        <div className="text-[10px] font-mono text-slate-400 mt-1">Ref: {p.payment_ref_id}</div>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="font-mono font-extrabold text-sm text-emerald-700">
                        ₹{p.amount.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-slate-400 capitalize">{p.status}</div>
                    </td>
                    <td className="p-4">
                      {p.order_id ? (
                        <div>
                          <div className="font-mono font-bold text-brand-700">
                            {p.order_number || `ORD-${p.order_id.slice(0, 6).toUpperCase()}`}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {p.order_expected_qty} x {p.order_product_name} ({p.order_scheduled_date})
                          </div>
                          {p.invoice_number && (
                            <div className="text-[10px] font-mono text-slate-400">Inv: {p.invoice_number}</div>
                          )}
                        </div>
                      ) : p.invoice_number ? (
                        <div className="text-[11px] font-mono text-slate-600">Invoice: {p.invoice_number}</div>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">General Account Payment</span>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      {p.order_id ? (
                        <button
                          onClick={() => navigate(`/app/deliveries?orderId=${p.order_id}`)}
                          className="px-3 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 rounded-lg text-xs font-bold inline-flex items-center space-x-1 transition"
                        >
                          <span>Open Order</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400 text-xs">
                    <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    No payments found matching the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-slate-600">
          <div className="flex items-center space-x-3">
            <span>
              Showing <strong>{startIdx}</strong>–<strong>{endIdx}</strong> of <strong>{total}</strong> payments
            </span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(parseInt(e.target.value, 10));
                setPage(1);
              }}
              className="px-2 py-1 border border-slate-200 rounded-lg bg-white text-xs font-semibold"
            >
              <option value={10}>10 / page</option>
              <option value={15}>15 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
            </select>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white hover:bg-slate-100 disabled:opacity-40 font-semibold inline-flex items-center space-x-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>
            <span className="px-3 py-1 font-mono font-bold text-slate-800">
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white hover:bg-slate-100 disabled:opacity-40 font-semibold inline-flex items-center space-x-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
