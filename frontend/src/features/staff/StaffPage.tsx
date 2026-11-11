import React, { useState, useEffect } from 'react';
import { apiClient } from '@/api/client';
import { 
  UserCheck, 
  Plus, 
  Phone, 
  Mail, 
  Building2, 
  Truck, 
  Shield, 
  X,
  CheckCircle2
} from 'lucide-react';

interface Employee {
  id: string;
  full_name: string;
  phone: string;
  email?: string;
  role: string;
  branch_id?: string;
  is_active: boolean;
}

interface Branch {
  id: string;
  name: string;
}

export const StaffPage: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    password: 'Password@123',
    role: 'delivery_driver',
    branch_id: '',
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [empRes, branchRes] = await Promise.all([
        apiClient.get('/admin/employees'),
        apiClient.get('/admin/branches')
      ]);
      setEmployees(empRes.data);
      setBranches(branchRes.data);
      if (branchRes.data.length > 0 && !form.branch_id) {
        setForm((prev) => ({ ...prev, branch_id: branchRes.data[0].id }));
      }
    } catch (err) {
      console.error('Failed to load staff data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/admin/employees', form);
      setIsAddOpen(false);
      setForm({
        full_name: '',
        phone: '',
        email: '',
        password: 'Password@123',
        role: 'delivery_driver',
        branch_id: branches[0]?.id || '',
      });
      await loadData();
    } catch (err: any) {
      alert(err.response?.data?.detail?.message || err.response?.data?.detail || 'Failed to add employee');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Staff, Drivers & Permissions</h1>
          <p className="text-xs text-slate-500">Manage plant workforce, delivery drivers, branch managers, and logins</p>
        </div>
        <button
          onClick={() => setIsAddOpen(true)}
          className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-semibold shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>Add Staff Member</span>
        </button>
      </div>

      {/* Employees Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {employees.map((emp) => (
          <div key={emp.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-sm text-slate-900">{emp.full_name}</h3>
                <span className="text-xs text-brand-600 capitalize font-medium">{emp.role.replace('_', ' ')}</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                emp.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {emp.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="space-y-1 text-xs text-slate-600 border-t border-slate-100 pt-3">
              <div className="flex items-center space-x-2">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>{emp.phone}</span>
              </div>
              {emp.email && (
                <div className="flex items-center space-x-2">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span className="truncate">{emp.email}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add Staff Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100">
            <h3 className="font-bold text-base text-slate-900 mb-1">Add Staff / Delivery Driver</h3>
            <p className="text-xs text-slate-500 mb-4">
              Drivers will be able to access the mobile PWA app with their phone number.
            </p>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="e.g. Ramesh Kumar"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Phone Number (Login ID) *</label>
                <input
                  type="text"
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  placeholder="9876543210"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Role & Permissions *</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  <option value="delivery_driver">Delivery Driver (Mobile PWA Only)</option>
                  <option value="branch_manager">Branch Manager</option>
                  <option value="accountant">Billing Executive / Accountant</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Assigned Branch / Depot</label>
                <select
                  value={form.branch_id}
                  onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 border rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                >
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

