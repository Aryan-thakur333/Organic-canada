import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  RefreshCw,
  Filter,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Users,
  DollarSign,
  FileText,
  Clock,
  Calendar,
  ArrowUpRight,
  Loader2,
  ShieldCheck,
  Ban,
  Play,
  Pause,
  Hash,
  BarChart3,
} from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import Button from '../components/common/Button';
import useToast from '../hooks/useToast';
import { b2bApi } from '../services/b2bApi';

// ── Helpers ────────────────────────────────────────────────────────────────

const fmtPrice = (cents) => `$${(cents / 100).toFixed(2)}`;
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const STATUS_FILTERS = ['all', 'pending', 'approved', 'rejected', 'active', 'inactive', 'suspended'];

const STATUS_STYLES = {
  pending:   'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800/25',
  approved:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/25',
  rejected:  'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800/25',
  active:    'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200 dark:border-blue-800/25',
  inactive:  'bg-stone-100 text-stone-700 dark:bg-stone-950/40 dark:text-stone-400 border border-stone-200 dark:border-stone-800/25',
  suspended: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800/25',
};

// ── Component ──────────────────────────────────────────────────────────────

export default function AdminB2BCompanies() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [companies, setCompanies] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null); // { company, newStatus }
  // ── Approve/reject form fields ──────────────────────────────────────────
  const [approveCreditLimit, setApproveCreditLimit] = useState('');
  const [approveAdminNote, setApproveAdminNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [modalFieldErrors, setModalFieldErrors] = useState({});

  // ── Fetch ────────────────────────────────────────────────────────────
  const fetchData = async (keepSearch = false) => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (search && keepSearch) params.search = search;
      const res = await b2bApi.adminListCompanies(params);
      setCompanies(res.companies || []);
      setCount(res.count || 0);
    } catch (err) {
      showToast('Failed to load B2B companies', 'error');
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(true); }, [statusFilter]);

  // ── Filter + Search ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search) return companies;
    const q = search.toLowerCase();
    return companies.filter(c =>
      c.company_name?.toLowerCase().includes(q) ||
      c.tax_id?.toLowerCase().includes(q) ||
      c.id?.toLowerCase().includes(q) ||
      c.customer_email?.toLowerCase().includes(q)
    );
  }, [companies, search]);

  // ── Validate approve form ────────────────────────────────────────────
  const validateApproveForm = () => {
    const errors = {};
    if (approveCreditLimit.trim()) {
      const val = parseFloat(approveCreditLimit);
      if (isNaN(val) || val < 0) {
        errors.creditLimit = 'Must be a non-negative number';
      }
    }
    setModalFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Status update ────────────────────────────────────────────────────
  const handleStatusUpdate = async () => {
    if (!confirmModal) return;
    const { company, newStatus } = confirmModal;

    // Validate approve form fields
    if (newStatus === 'approved' && !validateApproveForm()) return;

    setActionLoading(company.id);
    setConfirmModal(null);
    try {
      if (newStatus === 'approved') {
        const payload = {};
        if (approveCreditLimit.trim()) {
          payload.approved_credit_limit = parseFloat(approveCreditLimit);
        }
        if (approveAdminNote.trim()) {
          payload.admin_note = approveAdminNote.trim();
        }
        await b2bApi.adminApproveCompany(company.id, payload);
      } else if (newStatus === 'rejected') {
        await b2bApi.adminRejectCompany(company.id, {
          reason: rejectReason.trim() || 'Application rejected by admin',
        });
      } else if (newStatus === 'suspended') {
        await b2bApi.adminSuspendCompany(company.id, {
          admin_note: 'Suspended by admin',
        });
      } else {
        await b2bApi.adminUpdateCompanyStatus(company.id, { status: newStatus });
      }
      setCompanies(prev => prev.map(c =>
        c.id === company.id ? { ...c, status: newStatus } : c
      ));
      showToast(`${company.company_name} → ${newStatus}`, 'success');
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to update status';
      showToast(msg, 'error');
    } finally {
      setActionLoading(null);
      setApproveCreditLimit('');
      setApproveAdminNote('');
      setRejectReason('');
    }
  };

  const closeModal = () => {
    setConfirmModal(null);
    setModalFieldErrors({});
    setApproveCreditLimit('');
    setApproveAdminNote('');
    setRejectReason('');
  };

  const openConfirmModal = (company, newStatus) => {
    setConfirmModal({ company, newStatus });
    // Pre-fill form fields from company data
    if (newStatus === 'approved') {
      setApproveCreditLimit(company.requested_credit_limit ? String(company.requested_credit_limit / 100) : '');
      setApproveAdminNote(company.admin_note || '');
    } else if (newStatus === 'rejected') {
      setRejectReason('');
    }
    setModalFieldErrors({});
  };

  // ── Analytics ────────────────────────────────────────────────────────
  const analytics = useMemo(() => {
    const total = companies.length;
    const pendingCount = companies.filter(c => c.status === 'pending').length;
    const approvedCount = companies.filter(c => c.status === 'approved' || c.status === 'active').length;
    const rejectedCount = companies.filter(c => c.status === 'rejected').length;
    const suspendedCount = companies.filter(c => c.status === 'suspended').length;
    const totalCredit = companies.reduce((sum, c) => sum + (c.credit_limit || c.approved_credit_limit || 0), 0);
    const totalCustomers = companies.reduce((sum, c) => sum + (c.customer_id ? 1 : 0), 0);
    const totalQuotes = companies.reduce((sum, c) => sum + (c.quote_stats?.total || 0), 0);
    return { total, pendingCount, approvedCount, rejectedCount, suspendedCount, totalCredit, totalCustomers, totalQuotes };
  }, [companies]);

  const analyticsCards = [
    {
      label: 'Total Companies',
      value: analytics.total,
      icon: <Building2 size={24} />,
      color: 'text-accent-primary',
      bg: 'bg-accent-primary/10',
      change: `${analytics.approvedCount} approved`,
    },
    {
      label: 'Pending Approval',
      value: analytics.pendingCount,
      icon: <Clock size={24} />,
      color: 'text-amber-600',
      bg: 'bg-amber-500/10',
      change: `${analytics.rejectedCount} rejected`,
    },
    {
      label: 'Total Credit Extended',
      value: fmtPrice(analytics.totalCredit),
      icon: <DollarSign size={24} />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-500/10',
      change: `${analytics.totalQuotes} total quotes`,
    },
    {
      label: 'Linked Customers',
      value: analytics.totalCustomers,
      icon: <Users size={24} />,
      color: 'text-blue-600',
      bg: 'bg-blue-500/10',
      change: `across ${analytics.total} companies`,
    },
  ];

  // ── Actions by status ────────────────────────────────────────────────
  const getAvailableActions = (company) => {
    switch (company.status) {
      case 'pending':
        return [
          { action: 'approved', label: 'Approve', icon: <CheckCircle2 size={14} />, color: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 hover:bg-emerald-100' },
          { action: 'rejected', label: 'Reject', icon: <XCircle size={14} />, color: 'bg-red-50 dark:bg-red-950/30 text-red-500 hover:bg-red-100' },
        ];
      case 'approved':
      case 'active':
        return [
          { action: 'inactive', label: 'Deactivate', icon: <Pause size={14} />, color: 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 hover:bg-amber-100' },
          { action: 'suspended', label: 'Suspend', icon: <Ban size={14} />, color: 'bg-red-50 dark:bg-red-950/30 text-red-500 hover:bg-red-100' },
        ];
      case 'rejected':
        return [{ action: 'pending', label: 'Reopen', icon: <Play size={14} />, color: 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 hover:bg-blue-100' }];
      case 'inactive':
        return [{ action: 'active', label: 'Activate', icon: <Play size={14} />, color: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 hover:bg-emerald-100' }];
      case 'suspended':
        return [{ action: 'active', label: 'Reactivate', icon: <Play size={14} />, color: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 hover:bg-emerald-100' }];
      default:
        return [];
    }
  };

  const getModalTitle = (newStatus) => {
    switch (newStatus) {
      case 'approved': return 'Approve Company';
      case 'rejected': return 'Reject Application';
      case 'suspended': return 'Suspend Company';
      case 'active': return 'Activate Company';
      case 'inactive': return 'Deactivate Company';
      case 'pending': return 'Reopen Application';
      default: return 'Update Status';
    }
  };

  const getModalMessage = (company, newStatus) => {
    switch (newStatus) {
      case 'approved':
        return (
          <>
            <strong className="text-text-primary">{company.company_name}</strong> will be approved
            and the customer will be added to the B2B customer group for wholesale pricing.
          </>
        );
      case 'rejected':
        return (
          <>
            <strong className="text-text-primary">{company.company_name}</strong> application will be rejected.
            The customer can resubmit later.
          </>
        );
      case 'suspended':
        return (
          <>
            <strong className="text-text-primary">{company.company_name}</strong> will be suspended
            and will not be able to submit new orders or quotes.
          </>
        );
      case 'active':
        return (
          <>
            <strong className="text-text-primary">{company.company_name}</strong> will be reactivated.
          </>
        );
      default:
        return (
          <>
            <strong className="text-text-primary">{company.company_name}</strong> status will change
            from <strong>{company.status}</strong> to <strong>{newStatus}</strong>.
          </>
        );
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />

      <main className="pt-32 pb-20 container-custom">
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 mb-10">
          <button onClick={() => navigate('/admin')} className="p-2 rounded-full hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors">
            <ChevronLeft size={24} />
          </button>
          <div className="flex-1">
            <h1 className="text-4xl font-black text-text-primary">B2B Companies.</h1>
            <p className="text-sm text-text-secondary">Manage corporate accounts — approve registrations, adjust credit, and control account status.</p>
          </div>
          <button
            onClick={() => fetchData(true)}
            className="flex items-center gap-2 text-sm font-bold text-accent-primary hover:text-accent-secondary transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {/* ── Analytics Cards ───────────────────────────────────────────── */}
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-12">
          {analyticsCards.map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="bg-white dark:bg-slate-800 p-7 rounded-[2rem] shadow-premium border border-stone-100 dark:border-slate-700"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 rounded-2xl ${card.bg} ${card.color} flex items-center justify-center`}>
                  {card.icon}
                </div>
                <ArrowUpRight size={16} className="text-stone-300 dark:text-slate-600" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1">{card.label}</p>
              <p className={`text-3xl font-black ${card.color} mb-1`}>{loading ? '—' : card.value}</p>
              <p className="text-[10px] font-medium text-text-secondary">{card.change}</p>
            </motion.div>
          ))}
        </div>

        {/* ── Filters & Search ──────────────────────────────────────────── */}
        <div className="bg-white dark:bg-slate-800 border border-stone-100 dark:border-slate-700 rounded-[2rem] p-6 mb-6 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <Filter size={16} className="text-text-secondary" />
            {STATUS_FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  statusFilter === f
                    ? 'bg-accent-primary text-white shadow-md shadow-accent-primary/20'
                    : 'bg-stone-50 dark:bg-slate-900 text-text-secondary hover:text-text-primary'
                }`}
              >
                {f === 'all' ? 'All' : f}
              </button>
            ))}
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary" size={16} />
            <input
              type="text"
              placeholder="Search company, tax ID, email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-stone-50 dark:bg-slate-900 border-2 border-transparent focus:border-accent-primary rounded-2xl text-sm font-semibold outline-none transition-all"
            />
          </div>
        </div>

        {/* ── Table ─────────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-premium border border-stone-100 dark:border-slate-700 overflow-hidden">
          <div className="p-8 border-b border-stone-50 dark:border-slate-700 flex items-center justify-between">
            <h2 className="text-xl font-black">Companies ({filtered.length})</h2>
            <span className="text-xs font-bold text-text-secondary">
              {analytics.pendingCount} pending approval
            </span>
          </div>

          {loading ? (
            <div className="p-8 flex flex-col gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 bg-stone-50 dark:bg-slate-900 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-24 text-center text-text-secondary">
              <Building2 size={48} className="mx-auto mb-4 opacity-30" />
              <p className="font-bold">No companies found for this filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-stone-50 dark:bg-slate-900/50">
                  <tr>
                    {['Company', 'Admin', 'Customers', 'Credit Limit', 'Quotes', 'Status', 'Registered', 'Actions'].map(h => (
                      <th key={h} className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-text-secondary whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50 dark:divide-slate-700/50">
                  <AnimatePresence>
                    {filtered.map((company, i) => (
                      <motion.tr
                        key={company.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.03 }}
                        className="hover:bg-stone-50/50 dark:hover:bg-slate-900/20 transition-colors group"
                      >
                        {/* Company */}
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-accent-primary/10 text-accent-primary flex items-center justify-center shrink-0">
                              <Building2 size={16} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-text-primary truncate max-w-[160px]">
                                {company.company_name}
                              </p>
                              {company.tax_id && (
                                <p className="text-[10px] text-text-secondary font-mono">Tax: {company.tax_id}</p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Admin */}
                        <td className="px-6 py-5">
                          {company.customer_email ? (
                            <div>
                              <p className="text-sm font-semibold text-text-primary truncate max-w-[160px]">
                                {company.customer_email}
                              </p>
                              <p className="text-[10px] text-text-secondary font-medium truncate max-w-[160px]">
                                {company.customer_id || 'Customer linked'}
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-text-secondary italic">—</span>
                          )}
                        </td>

                        {/* Customers */}
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-1.5">
                            <Users size={14} className="text-stone-400" />
                            <span className="text-sm font-bold text-text-primary">{company.customer_id ? 1 : 0}</span>
                          </div>
                        </td>

                        {/* Credit Limit */}
                        <td className="px-6 py-5">
                          <div>
                            <p className="text-sm font-black text-text-primary">{fmtPrice(company.credit_limit || company.approved_credit_limit || 0)}</p>
                            {company.requested_credit_limit > 0 && (
                              <p className="text-[9px] text-text-secondary font-medium">Requested: {fmtPrice(company.requested_credit_limit)}</p>
                            )}
                          </div>
                        </td>

                        {/* Quotes */}
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-1.5">
                            <FileText size={14} className="text-stone-400" />
                            <span className="text-sm font-bold text-text-primary">{company.quote_stats?.total || 0}</span>
                            {company.quote_stats?.pending > 0 && (
                              <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                                ({company.quote_stats.pending} pending)
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-6 py-5">
                          <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider ${STATUS_STYLES[company.status] || STATUS_STYLES.inactive}`}>
                            {company.status}
                          </span>
                        </td>

                        {/* Registered */}
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
                            <Calendar size={12} />
                            {fmtDate(company.created_at)}
                          </div>
                          {company.approved_at && (
                            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                              <CheckCircle2 size={10} />
                              Approved {fmtDate(company.approved_at)}
                            </div>
                          )}
                          {company.rejected_at && (
                            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-red-500 dark:text-red-400 mt-0.5">
                              <XCircle size={10} />
                              Rejected {fmtDate(company.rejected_at)}
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {getAvailableActions(company).map(({ action, label, icon, color }) => (
                              <button
                                key={action}
                                title={label}
                                disabled={actionLoading === company.id}
                                onClick={() => openConfirmModal(company, action)}
                                className={`p-2 rounded-xl transition-colors disabled:opacity-40 ${color}`}
                              >
                                {actionLoading === company.id ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  icon
                                )}
                              </button>
                            ))}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* ── Confirm Modal ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {confirmModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"                    onClick={() => { closeModal(); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className={`w-full bg-white dark:bg-slate-800 rounded-[2rem] shadow-2xl border border-stone-100 dark:border-slate-700 text-center ${
                confirmModal.newStatus === 'approved'
                  ? 'max-w-md'
                  : 'max-w-sm'
              } ${confirmModal.newStatus === 'rejected' ? 'p-8' : 'p-8'}`}
            >
              <div className={`inline-flex p-3 rounded-full mb-4 ${
                confirmModal.newStatus === 'approved' || confirmModal.newStatus === 'active'
                  ? 'bg-emerald-500/10 text-emerald-600'
                  : confirmModal.newStatus === 'rejected' || confirmModal.newStatus === 'suspended'
                    ? 'bg-red-500/10 text-red-500'
                    : 'bg-amber-500/10 text-amber-600'
              }`}>
                {confirmModal.newStatus === 'approved' || confirmModal.newStatus === 'active'
                  ? <CheckCircle2 size={28} />
                  : <AlertTriangle size={28} />
                }
              </div>

              <h3 className="text-2xl font-black text-text-primary mb-2">{getModalTitle(confirmModal.newStatus)}</h3>
              <p className="text-sm text-text-secondary mb-2 leading-relaxed">
                {getModalMessage(confirmModal.company, confirmModal.newStatus)}
              </p>
              <p className="text-xs text-text-secondary mb-6">
                Current: <span className="font-bold">{confirmModal.company.status}</span>
                {' → '}
                <span className="font-bold">{confirmModal.newStatus}</span>
              </p>

              {/* ── Approve Form Fields ────────────────────────────────── */}
              {confirmModal.newStatus === 'approved' && (
                <div className="text-left space-y-4 mb-6 border-t border-stone-100 dark:border-slate-700 pt-5">
                  {/* Credit Limit */}
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1.5">
                      Approved Credit Limit <span className="text-stone-400 font-normal normal-case">— in dollars (optional)</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 font-bold text-xs">$</span>
                      <input
                        type="number"
                        min={0}
                        step={100}
                        value={approveCreditLimit}
                        onChange={(e) => {
                          setApproveCreditLimit(e.target.value);
                          if (modalFieldErrors.creditLimit) setModalFieldErrors((prev) => ({ ...prev, creditLimit: '' }));
                        }}
                        placeholder="e.g. 5000"
                        className={`w-full pl-7 pr-3 py-2.5 bg-stone-50 dark:bg-slate-900 border-2 rounded-xl text-sm font-semibold outline-none transition-all ${
                          modalFieldErrors.creditLimit
                            ? 'border-red-300 dark:border-red-700 focus:border-red-500'
                            : 'border-transparent focus:border-accent-primary'
                        }`}
                      />
                    </div>
                    {modalFieldErrors.creditLimit && (
                      <p className="mt-1 text-[10px] font-medium text-red-500">{modalFieldErrors.creditLimit}</p>
                    )}
                    <p className="mt-1 text-[10px] text-text-secondary font-medium">
                      Leave empty to use requested limit of {fmtPrice(confirmModal.company.requested_credit_limit || 0)}.
                    </p>
                  </div>

                  {/* Admin Note */}
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1.5">
                      Admin Note <span className="text-stone-400 font-normal normal-case">— optional</span>
                    </label>
                    <textarea
                      rows={2}
                      value={approveAdminNote}
                      onChange={(e) => setApproveAdminNote(e.target.value)}
                      placeholder="Add an internal note about this approval..."
                      className="w-full px-3.5 py-2.5 bg-stone-50 dark:bg-slate-900 border-2 border-transparent focus:border-accent-primary rounded-xl text-sm font-semibold outline-none transition-all resize-none"
                    />
                  </div>

                  {/* Customer group info */}
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/25 rounded-xl text-left">
                    <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1.5">
                      <CheckCircle2 size={12} />
                      Customer will be added to B2B Partners group for wholesale pricing.
                    </p>
                  </div>
                </div>
              )}

              {/* ── Reject Form Fields ─────────────────────────────────── */}
              {confirmModal.newStatus === 'rejected' && (
                <div className="text-left space-y-4 mb-6 border-t border-stone-100 dark:border-slate-700 pt-5">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1.5">
                      Rejection Reason <span className="text-stone-400 font-normal normal-case">— optional</span>
                    </label>
                    <textarea
                      rows={2}
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Explain why the application is being rejected..."
                      className="w-full px-3.5 py-2.5 bg-stone-50 dark:bg-slate-900 border-2 border-transparent focus:border-red-500 rounded-xl text-sm font-semibold outline-none transition-all resize-none"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 text-xs font-black uppercase tracking-wider"
                  onClick={() => { closeModal(); }}
                >
                  Cancel
                </Button>
                <Button
                  className={`flex-1 text-xs font-black uppercase tracking-wider ${
                    confirmModal.newStatus === 'approved' || confirmModal.newStatus === 'active'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : confirmModal.newStatus === 'suspended'
                        ? 'bg-red-600 hover:bg-red-700'
                        : confirmModal.newStatus === 'rejected'
                          ? 'bg-red-600 hover:bg-red-700'
                          : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                  onClick={handleStatusUpdate}
                  isLoading={actionLoading === confirmModal.company.id}
                >
                  {confirmModal.newStatus === 'approved' ? 'Approve & Add to Group'
                    : confirmModal.newStatus === 'rejected' ? 'Reject Application'
                    : 'Confirm'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
