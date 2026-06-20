import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  ChevronLeft,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Users,
  Mail,
  Phone,
  User,
  Hash,
  DollarSign,
  RefreshCw,
  Pencil,
  X,
  ShieldCheck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import Button from '../components/common/Button';
import { b2bApi } from '../services/b2bApi';
import useToast from '../hooks/useToast';

// ── Helpers ────────────────────────────────────────────────────────────────

const fmtPrice = (cents) => `$${(cents / 100).toFixed(2)}`;

const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const STATUS_STYLES = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/25',
  inactive: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800/25',
  suspended: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400 border border-red-200 dark:border-red-800/25',
};

// ── Component ──────────────────────────────────────────────────────────────

const B2BManageCompany = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  // ── State ─────────────────────────────────────────────────────────────
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Edit form state ───────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    company_name: '',
    tax_id: '',
    credit_limit: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});

  // ── Members state ─────────────────────────────────────────────────────
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [companyName, setCompanyName] = useState('');

  // ── Fetch company ─────────────────────────────────────────────────────
  const fetchCompany = async () => {
    setLoading(true);
    try {
      const res = await b2bApi.getCompany();
      const c = res?.company ?? null;
      setCompany(c);
      if (c) {
        setFormData({
          company_name: c.company_name || '',
          tax_id: c.tax_id || '',
          credit_limit: c.credit_limit ? String(c.credit_limit / 100) : '',
        });
      }
    } catch {
      setCompany(null);
    } finally {
      setLoading(false);
    }
  };

  // ── Fetch members ─────────────────────────────────────────────────────
  const fetchMembers = async () => {
    setMembersLoading(true);
    try {
      const res = await b2bApi.getCompanyMembers();
      setMembers(res?.members || []);
      setCompanyName(res?.company_name || '');
    } catch {
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  };

  useEffect(() => {
    fetchCompany();
    fetchMembers();
  }, []);

  // ── Validation ────────────────────────────────────────────────────────
  const validate = () => {
    const errors = {};
    if (!formData.company_name.trim()) {
      errors.company_name = 'Company name cannot be empty';
    }
    if (formData.tax_id.trim() && !/^[A-Za-z0-9-]+$/.test(formData.tax_id.trim())) {
      errors.tax_id = 'Tax ID can only contain letters, numbers, and hyphens';
    }
    if (formData.credit_limit.trim()) {
      const val = parseFloat(formData.credit_limit);
      if (isNaN(val) || val < 0) {
        errors.credit_limit = 'Must be a non-negative number';
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Save ──────────────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {};
      if (formData.company_name.trim() !== company.company_name) {
        payload.company_name = formData.company_name.trim();
      }
      if (formData.tax_id !== (company.tax_id || '')) {
        payload.tax_id = formData.tax_id.trim() || null;
      }
      if (formData.credit_limit !== (company.credit_limit ? String(company.credit_limit / 100) : '')) {
        payload.credit_limit = formData.credit_limit.trim()
          ? Math.round(parseFloat(formData.credit_limit) * 100)
          : 0;
      }

      if (Object.keys(payload).length === 0) {
        showToast('No changes to save', 'warning');
        setEditing(false);
        return;
      }

      await b2bApi.updateCompany(payload);
      showToast('Company updated successfully! ✅', 'success');
      setEditing(false);
      await fetchCompany();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to update company';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setFieldErrors({});
    if (company) {
      setFormData({
        company_name: company.company_name || '',
        tax_id: company.tax_id || '',
        credit_limit: company.credit_limit ? String(company.credit_limit / 100) : '',
      });
    }
  };

  // ── Render: Loading ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary">
        <Navbar />
        <main className="pt-40 pb-20 container-custom flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 size={40} className="animate-spin text-accent-primary" />
            <p className="text-text-secondary font-medium">Loading company details...</p>
          </div>
        </main>
        <Footer />
        <MobileNav />
      </div>
    );
  }

  // ── Render: No company ────────────────────────────────────────────────
  if (!company) {
    return (
      <div className="min-h-screen bg-bg-primary">
        <Navbar />
        <main className="pt-32 pb-20 container-custom">
          <div className="max-w-lg mx-auto bg-white dark:bg-slate-800 rounded-[2.5rem] p-12 shadow-premium border border-stone-100 dark:border-slate-700 text-center">
            <div className="inline-flex p-6 rounded-full bg-amber-500/10 text-amber-600 mb-6">
              <Building2 size={48} />
            </div>
            <h2 className="text-3xl font-black mb-3">No Company Found</h2>
            <p className="text-text-secondary mb-8 leading-relaxed">
              You need to register a B2B company before you can manage it.
            </p>
            <Button
              size="lg"
              className="gap-2"
              onClick={() => navigate('/dashboard/b2b/register')}
            >
              <Building2 size={18} /> Register Company
            </Button>
          </div>
        </main>
        <Footer />
        <MobileNav />
      </div>
    );
  }

  // ── Render: Main page ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />

      <main className="pt-32 pb-20 container-custom">
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 mb-10">
          <button
            onClick={() => navigate('/profile')}
            className="p-2 rounded-full hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <div className="flex-1">
            <h1 className="text-4xl font-black text-text-primary">Manage Company.</h1>
            <p className="text-sm text-text-secondary">
              Edit your B2B company profile and view team members.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="gap-2 text-xs font-black uppercase tracking-wider"
              onClick={() => navigate('/dashboard/b2b/quotes')}
            >
              <Building2 size={14} /> New Quote
            </Button>
            <button
              onClick={() => { fetchCompany(); fetchMembers(); }}
              className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 text-text-secondary hover:text-text-primary transition-colors"
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-5 gap-8 items-start">
          {/* ── Left: Company Details ────────────────────────────────────── */}
          <div className="lg:col-span-3 space-y-6">
            {/* ── Company Info Card ─────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-8 shadow-premium border border-stone-100 dark:border-slate-700"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-accent-primary/10 text-accent-primary flex items-center justify-center">
                    <Building2 size={24} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-text-primary">Company Profile</h2>
                    <p className="text-xs text-text-secondary font-medium">
                      {editing ? 'Edit your company details below' : 'View and manage your company information'}
                    </p>
                  </div>
                </div>
                {!editing ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="gap-2 text-xs font-black uppercase tracking-wider"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil size={14} /> Edit
                  </Button>
                ) : (
                  <button
                    onClick={cancelEdit}
                    className="p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-slate-700 text-stone-400 hover:text-red-500 transition-colors"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>

              {editing ? (
                /* ── Edit Form ──────────────────────────────────────────── */
                <form onSubmit={handleSave}>
                  {/* Company Name */}
                  <div className="mb-5">
                    <label className="block text-xs font-black uppercase tracking-widest text-text-secondary mb-2">
                      Company Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.company_name}
                      onChange={(e) => {
                        setFormData(prev => ({ ...prev, company_name: e.target.value }));
                        if (fieldErrors.company_name) setFieldErrors(prev => ({ ...prev, company_name: '' }));
                      }}
                      className={`w-full px-4 py-3.5 bg-stone-50 dark:bg-slate-900 border-2 rounded-2xl text-sm font-semibold outline-none transition-all ${
                        fieldErrors.company_name
                          ? 'border-red-300 dark:border-red-700 focus:border-red-500'
                          : 'border-transparent focus:border-accent-primary'
                      }`}
                    />
                    {fieldErrors.company_name && (
                      <p className="mt-1.5 text-xs font-medium text-red-500 flex items-center gap-1">
                        <AlertCircle size={12} /> {fieldErrors.company_name}
                      </p>
                    )}
                  </div>

                  {/* Tax ID */}
                  <div className="mb-5">
                    <label className="block text-xs font-black uppercase tracking-widest text-text-secondary mb-2">
                      Tax ID / VAT <span className="text-stone-400 font-normal normal-case">— optional</span>
                    </label>
                    <div className="relative">
                      <Hash size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
                      <input
                        type="text"
                        value={formData.tax_id}
                        onChange={(e) => {
                          setFormData(prev => ({ ...prev, tax_id: e.target.value }));
                          if (fieldErrors.tax_id) setFieldErrors(prev => ({ ...prev, tax_id: '' }));
                        }}
                        placeholder="Leave blank if not applicable"
                        className={`w-full pl-10 pr-4 py-3.5 bg-stone-50 dark:bg-slate-900 border-2 rounded-2xl text-sm font-semibold outline-none transition-all ${
                          fieldErrors.tax_id
                            ? 'border-red-300 dark:border-red-700 focus:border-red-500'
                            : 'border-transparent focus:border-accent-primary'
                        }`}
                      />
                    </div>
                    {fieldErrors.tax_id && (
                      <p className="mt-1.5 text-xs font-medium text-red-500 flex items-center gap-1">
                        <AlertCircle size={12} /> {fieldErrors.tax_id}
                      </p>
                    )}
                  </div>

                  {/* Credit Limit */}
                  <div className="mb-8">
                    <label className="block text-xs font-black uppercase tracking-widest text-text-secondary mb-2">
                      Credit Limit (USD)
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 font-bold text-sm">$</span>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={formData.credit_limit}
                        onChange={(e) => {
                          setFormData(prev => ({ ...prev, credit_limit: e.target.value }));
                          if (fieldErrors.credit_limit) setFieldErrors(prev => ({ ...prev, credit_limit: '' }));
                        }}
                        className={`w-full pl-8 pr-4 py-3.5 bg-stone-50 dark:bg-slate-900 border-2 rounded-2xl text-sm font-semibold outline-none transition-all ${
                          fieldErrors.credit_limit
                            ? 'border-red-300 dark:border-red-700 focus:border-red-500'
                            : 'border-transparent focus:border-accent-primary'
                        }`}
                      />
                    </div>
                    {fieldErrors.credit_limit && (
                      <p className="mt-1.5 text-xs font-medium text-red-500 flex items-center gap-1">
                        <AlertCircle size={12} /> {fieldErrors.credit_limit}
                      </p>
                    )}
                    <p className="mt-1.5 text-[11px] text-text-secondary font-medium">
                      Current limit: <strong>{fmtPrice(company.credit_limit)}</strong>. Changes subject to admin approval.
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 text-xs font-black uppercase tracking-wider"
                      onClick={cancelEdit}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="flex-1 gap-2 text-xs font-black uppercase tracking-wider"
                      disabled={saving}
                      isLoading={saving}
                    >
                      <Save size={16} />
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                </form>
              ) : (
                /* ── Read-only view ─────────────────────────────────────── */
                <div className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-5">
                    <div className="p-4 bg-stone-50 dark:bg-slate-900/40 rounded-2xl text-xs">
                      <p className="text-[10px] text-text-secondary font-black uppercase tracking-widest mb-1">Company Name</p>
                      <p className="font-bold text-text-primary text-sm">{company.company_name}</p>
                    </div>
                    <div className="p-4 bg-stone-50 dark:bg-slate-900/40 rounded-2xl text-xs">
                      <p className="text-[10px] text-text-secondary font-black uppercase tracking-widest mb-1">Tax ID</p>
                      <p className="font-bold text-text-primary text-sm">{company.tax_id || '—'}</p>
                    </div>
                    <div className="p-4 bg-stone-50 dark:bg-slate-900/40 rounded-2xl text-xs">
                      <p className="text-[10px] text-text-secondary font-black uppercase tracking-widest mb-1">Credit Limit</p>
                      <p className="font-bold text-text-primary text-sm">{fmtPrice(company.credit_limit)}</p>
                    </div>
                    <div className="p-4 bg-stone-50 dark:bg-slate-900/40 rounded-2xl text-xs">
                      <p className="text-[10px] text-text-secondary font-black uppercase tracking-widest mb-1">Status</p>
                      <span className={`inline-block px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${STATUS_STYLES[company.status] || STATUS_STYLES.inactive}`}>
                        {company.status}
                      </span>
                    </div>
                  </div>
                  <div className="p-4 bg-stone-50 dark:bg-slate-900/40 rounded-2xl text-xs">
                    <p className="text-[10px] text-text-secondary font-black uppercase tracking-widest mb-1">Company ID</p>
                    <p className="font-mono text-xs font-bold text-text-primary">{company.id}</p>
                  </div>
                </div>
              )}
            </motion.div>

            {/* ── Team Members Card ──────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-8 shadow-premium border border-stone-100 dark:border-slate-700"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Users size={24} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-text-primary">Team Members</h2>
                    <p className="text-xs text-text-secondary font-medium">
                      {membersLoading ? 'Loading...' : `${members.length} member${members.length !== 1 ? 's' : ''} linked to your company`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={fetchMembers}
                  className="p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-slate-700 text-text-secondary hover:text-text-primary transition-colors"
                >
                  <RefreshCw size={16} className={membersLoading ? 'animate-spin' : ''} />
                </button>
              </div>

              {membersLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-16 bg-stone-50 dark:bg-slate-900/40 rounded-2xl animate-pulse" />
                  ))}
                </div>
              ) : members.length === 0 ? (
                <div className="py-12 text-center">
                  <Users size={36} className="mx-auto mb-3 text-stone-300 dark:text-slate-600" />
                  <p className="text-sm font-bold text-text-secondary">No team members found</p>
                  <p className="text-xs text-text-secondary mt-1">Only you are currently linked to this company.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className={`flex items-center gap-4 p-4 rounded-2xl text-xs transition-colors ${
                        member.is_you
                          ? 'bg-accent-primary/5 border border-accent-primary/10'
                          : 'bg-stone-50 dark:bg-slate-900/40 border border-transparent'
                      }`}
                    >
                      {/* Avatar */}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                        member.is_you
                          ? 'bg-accent-primary/10 text-accent-primary'
                          : 'bg-stone-200 dark:bg-slate-700 text-stone-500 dark:text-slate-400'
                      }`}>
                        {(member.first_name?.[0] || member.email?.[0] || '?').toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-text-primary truncate">
                            {[member.first_name, member.last_name].filter(Boolean).join(' ') || member.email}
                          </p>
                          {member.is_you && (
                            <span className="px-2 py-0.5 rounded-full bg-accent-primary/10 text-accent-primary text-[8px] font-black uppercase tracking-wider">
                              You
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-text-secondary">
                          <span className="flex items-center gap-1">
                            <Mail size={11} /> {member.email}
                          </span>
                          {member.phone && (
                            <span className="flex items-center gap-1">
                              <Phone size={11} /> {member.phone}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Role badge */}
                      <span className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-wider border ${
                        member.is_you
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400 border-purple-200 dark:border-purple-800/25'
                          : 'bg-stone-100 text-stone-500 dark:bg-slate-700 dark:text-slate-400 border-stone-200 dark:border-slate-600'
                      }`}>
                        {member.is_you ? 'Admin' : 'Member'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>

          {/* ── Right Sidebar ────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-4">
            {/* Company summary card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-6 shadow-premium border border-stone-100 dark:border-slate-700 sticky top-36"
            >
              <h3 className="text-xl font-black text-text-primary mb-5 flex items-center gap-2">
                <ShieldCheck size={20} className="text-accent-primary" />
                Company Summary
              </h3>

              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-stone-50 dark:bg-slate-900/40 rounded-2xl">
                  <div className="w-10 h-10 rounded-xl bg-accent-primary/10 text-accent-primary flex items-center justify-center shrink-0">
                    <Building2 size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-text-primary">{company.company_name}</p>
                    <p className="text-[10px] text-text-secondary font-medium">Company</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-stone-50 dark:bg-slate-900/40 rounded-2xl">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                    <DollarSign size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-text-primary">{fmtPrice(company.credit_limit)}</p>
                    <p className="text-[10px] text-text-secondary font-medium">Credit Limit</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-stone-50 dark:bg-slate-900/40 rounded-2xl">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
                    <Users size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-text-primary">{members.length}</p>
                    <p className="text-[10px] text-text-secondary font-medium">Team Member{members.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              </div>

              <div className="h-px bg-stone-100 dark:bg-slate-700 my-5" />

              <div className="space-y-2">
                <Button
                  size="sm"
                  className="w-full gap-2 text-xs font-black uppercase tracking-wider"
                  onClick={() => navigate('/dashboard/b2b/quotes')}
                >
                  <Building2 size={14} /> New Quote Request
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full gap-2 text-xs font-black uppercase tracking-wider"
                  onClick={() => navigate('/dashboard/b2b/history')}
                >
                  View Quote History
                </Button>
              </div>
            </motion.div>
          </div>
        </div>
      </main>

      <Footer />
      <MobileNav />
    </div>
  );
};

export default B2BManageCompany;
