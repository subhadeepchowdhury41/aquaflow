import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/api/client';
import {
  Receipt,
  Search,
  Filter,
  Calendar,
  RotateCcw,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ExternalLink
} from 'lucide-react';

interface Invoice {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_phone?: string;
  order_id?: string;
  order_number?: string;
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
}

export const InvoicesPage: React.FC = () => {
  const navigate = useNavigate();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalAmountFiltered, setTotalAmountFiltered] = useState(0);
  const [totalBalanceDueFiltered, setTotalBalanceDueFiltered] = useState(0);
  const [loading, setLoading] = useState(true);

  // Search, Filters & Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadInvoices = async (targetPage = page) => {
    try {
      setLoading(true);
      const params: Record<string, any> = {
        page: targetPage,
        page_size: pageSize,
      };
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const res = await apiClient.get('/invoices/paginated', { params });
      setInvoices(res.data.items || []);
      setTotal(res.data.total || 0);
      setTotalPages(res.data.total_pages || 1);
      setTotalAmountFiltered(res.data.total_amount_filtered || 0);
      setTotalBalanceDueFiltered(res.data.total_balance_due_filtered || 0);
    } catch (err) {
      console.error('Failed to load invoices', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices(page);
  }, [page, pageSize, statusFilter, dateFrom, dateTo]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadInvoices(1);
  };

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const startIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(total, page * pageSize);

  return (
    <div className="space-y-5">
      {/* Header & KPI Summary */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Order Invoices Directory</h1>
          <p className="text-xs text-slate-500 mt-1">
            Auto-generated GST invoices per order — filter by status, search customer or invoice #, and track balance due
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-right">
            <div className="text-[10px] uppercase font-bold text-slate-400">Invoices</div>
            <div className="text-sm font-extrabold font-mono text-slate-900">{total}</div>
          </div>
          <div className="bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-right">
            <div className="text-[10px] uppercase font-bold text-slate-400">Total Billed</div>
            <div className="text-sm font-extrabold font-mono text-slate-900">
              ₹{totalAmountFiltered.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="bg-rose-50 border border-rose-200 px-3.5 py-2 rounded-xl text-right">
            <div className="text-[10px] uppercase font-bold text-rose-700">Balance Due</div>
            <div className="text-sm font-extrabold font-mono text-rose-700">
              ₹{totalBalanceDueFiltered.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <button
            onClick={() => loadInvoices(page)}
            className="p-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition"
            title="Refresh Invoices"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Search & Filters Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice #, order #, customer name or phone..."
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
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white text-slate-700"
            >
              <option value="">All Statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="partially_paid">Partially Paid</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

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

      {/* Invoices List Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="p-4">Invoice #</th>
                <th className="p-4">Customer</th>
                <th className="p-4">Linked Order</th>
                <th className="p-4">Period</th>
                <th className="p-4">Due Date</th>
                <th className="p-4 text-right">Subtotal</th>
                <th className="p-4 text-right">GST Tax</th>
                <th className="p-4 text-right">Total Amount</th>
                <th className="p-4 text-right">Balance Due</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50/60 transition">
                  <td className="p-4 font-mono font-bold text-brand-600">
                    {inv.invoice_number}
                  </td>
                  <td className="p-4">
                    <div className="font-semibold text-slate-900">{inv.customer_name}</div>
                    {inv.customer_phone && <div className="text-[11px] text-slate-400">{inv.customer_phone}</div>}
                  </td>
                  <td className="p-4">
                    {inv.order_id ? (
                      <button
                        onClick={() => navigate(`/app/deliveries?orderId=${inv.order_id}`)}
                        className="inline-flex items-center space-x-1 font-mono font-bold text-brand-700 hover:underline"
                      >
                        <span>{inv.order_number || `ORD-${inv.order_id.slice(0, 6).toUpperCase()}`}</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    ) : (
                      <span className="text-slate-400 italic text-[11px]">Cycle Billing</span>
                    )}
                  </td>
                  <td className="p-4 text-slate-500">
                    {new Date(inv.billing_period_start).toLocaleDateString()} - {new Date(inv.billing_period_end).toLocaleDateString()}
                  </td>
                  <td className="p-4 text-slate-500">
                    {new Date(inv.due_date).toLocaleDateString()}
                  </td>
                  <td className="p-4 text-right font-mono">
                    ₹{inv.subtotal.toFixed(2)}
                  </td>
                  <td className="p-4 text-right font-mono text-slate-500">
                    ₹{inv.total_tax.toFixed(2)}
                  </td>
                  <td className="p-4 text-right font-mono font-bold text-slate-900">
                    ₹{inv.total_amount.toFixed(2)}
                  </td>
                  <td className={`p-4 text-right font-mono font-bold ${inv.balance_due > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    ₹{inv.balance_due.toFixed(2)}
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        inv.status === 'paid'
                          ? 'bg-emerald-100 text-emerald-700'
                          : inv.status === 'partially_paid'
                          ? 'bg-blue-100 text-blue-700'
                          : inv.status === 'cancelled'
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {inv.status.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
              {!loading && invoices.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-10 text-center text-slate-400">
                    <Receipt className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    No invoices found matching current filters.
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
              Showing <strong>{startIdx}</strong>–<strong>{endIdx}</strong> of <strong>{total}</strong> invoices
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
