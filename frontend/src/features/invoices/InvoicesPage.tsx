import React, { useState, useEffect } from 'react';
import { apiClient } from '@/api/client';
import { 
  Receipt, 
  Plus, 
  IndianRupee, 
  FileText, 
  CheckCircle2, 
  Clock, 
  Calendar,
  CreditCard,
  X
} from 'lucide-react';

interface Invoice {
  id: string;
  customer_id: string;
  customer_name: string;
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

interface CustomerOption {
  id: string;
  name: string;
  customer_code: string;
}

export const InvoicesPage: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Generate Monthly Invoices modal
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [genMonth, setGenMonth] = useState(new Date().getMonth() + 1);
  const [genYear, setGenYear] = useState(new Date().getFullYear());

  // Record Payment modal
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    customer_id: '',
    amount: 500,
    payment_method: 'upi',
    payment_ref_id: '',
    notes: '',
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [invRes, custRes] = await Promise.all([
        apiClient.get('/invoices'),
        apiClient.get('/customers')
      ]);
      setInvoices(invRes.data);
      setCustomers(custRes.data);
      if (custRes.data.length > 0 && !paymentForm.customer_id) {
        setPaymentForm((prev) => ({ ...prev, customer_id: custRes.data[0].id }));
      }
    } catch (err) {
      console.error('Failed to load invoice data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleGenerateInvoices = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiClient.post('/invoices/generate-monthly', {
        billing_month: genMonth,
        billing_year: genYear,
        due_days: 7,
      });
      alert(`Bulk Invoicing Complete: ${res.data.message}`);
      setIsGenerateOpen(false);
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.detail?.message || 'Invoice generation failed');
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/invoices/payments', paymentForm);
      setIsPaymentOpen(false);
      setPaymentForm({
        customer_id: customers[0]?.id || '',
        amount: 500,
        payment_method: 'upi',
        payment_ref_id: '',
        notes: '',
      });
      alert('Payment recorded and credited to customer ledger successfully.');
      await loadData();
    } catch (err: any) {
      alert('Payment recording failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Billing & Payment Reconciliation</h1>
          <p className="text-xs text-slate-500">GST-ready automated invoice generation and customer account credits</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsPaymentOpen(true)}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Record Payment</span>
          </button>
          <button
            onClick={() => setIsGenerateOpen(true)}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-semibold shadow-sm transition"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Generate Monthly Invoices</span>
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
                  <td className="p-4 font-medium text-slate-900">
                    {inv.customer_name}
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
                  <td className="p-4 text-right font-mono font-bold text-rose-600">
                    ₹{inv.balance_due.toFixed(2)}
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        inv.status === 'paid'
                          ? 'bg-emerald-100 text-emerald-700'
                          : inv.status === 'partially_paid'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {inv.status}
                    </span>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
                    No invoices generated yet. Click "Generate Monthly Invoices" to process billing cycle.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Generate Monthly Invoices Dialog */}
      {isGenerateOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100">
            <h3 className="font-bold text-base text-slate-900 mb-1">Generate Monthly Billing Run</h3>
            <p className="text-xs text-slate-500 mb-4">
              Aggregates all completed jar delivery logs for the cycle, calculates GST, and posts invoices.
            </p>
            <form onSubmit={handleGenerateInvoices} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Month</label>
                  <select
                    value={genMonth}
                    onChange={(e) => setGenMonth(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                      <option key={m} value={m}>Month {m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Year</label>
                  <input
                    type="number"
                    value={genYear}
                    onChange={(e) => setGenYear(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsGenerateOpen(false)}
                  className="px-4 py-2 border rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                >
                  Run Invoicing
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Payment Dialog */}
      {isPaymentOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100">
            <h3 className="font-bold text-base text-slate-900 mb-1">Record Customer Payment</h3>
            <p className="text-xs text-slate-500 mb-4">
              Receipts are recorded and immediately credited to the immutable customer ledger.
            </p>
            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Select Customer</label>
                <select
                  value={paymentForm.customer_id}
                  onChange={(e) => setPaymentForm({ ...paymentForm, customer_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.customer_code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border rounded-lg text-sm font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Payment Method</label>
                  <select
                    value={paymentForm.payment_method}
                    onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                  >
                    <option value="upi">UPI / QR Code</option>
                    <option value="cash">Cash Collection</option>
                    <option value="bank_transfer">NEFT / RTGS</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Transaction Ref / UTR #</label>
                <input
                  type="text"
                  value={paymentForm.payment_ref_id}
                  onChange={(e) => setPaymentForm({ ...paymentForm, payment_ref_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="e.g. UPI-TXN-12345"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPaymentOpen(false)}
                  className="px-4 py-2 border rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                >
                  Confirm Credit Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

