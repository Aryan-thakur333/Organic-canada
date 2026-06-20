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

const STATUS_FILTERS = ['all', 'active', 'inactive', 'suspended'];

const STATUS_STYLES = {
  active:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/25',
  inactive:  'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800/25',
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
      c.primary_admin?.email?.toLowerCase().includes(q)
    );
  }, [companies, search]);

  // ── Status update ────────────────────────────────────────────────────
  const handleStatusUpdate = async () => {
    if (!confirmModal) return;
    const { company, newStatus } = confirmModal;

    setActionLoading(company.id);
    setConfirmModal(null);
    try {
      await b2bApi.adminUpdateCompanyStatus(company.id, { status: newStatus });
      setCompanies(prev => prev.map(c =>
        c.id === company.id ? { ...c, status: newStatus } : c
      ));
      showToast(`${company.company_name} → ${newStatus}`, 'success');
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to update status';
      showToast(msg, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const openConfirmModal = (company, newStatus) => {
    setConfirmModal({ company, newStatus });
  };

  // ── Analytics ────────────────────────────────────────────────────────
  const analytics = useMemo(() => {
    const total = companies.length;
    const activeCount = companies.filter(c => c.status === 'active').length;
    const inactiveCount = companies.filter(c => c.status === 'inactive').length;
    const suspendedCount = companies.filter(c => c.status === 'suspended').length;
    const totalCredit = companies.reduce((sum, c) => sum + (c.credit_limit || 0), 0);
    const totalCustomers = companies.reduce((sum, c) => sum + (c.customer_count || 0), 0);
    const totalQuotes = companies.reduce((sum, c) => sum + (c.quote_stats?.total || 0), 0);
    return { total, activeCount, inactiveCount, suspendedCount, totalCredit, totalCustomers, totalQuotes };
  }, [companies]);

  const analyticsCards = [
    {
      label: 'Total Companies',
      value: analytics.total,
      icon: <Building2 size={24} />,
      color: 'text-accent-primary',
      bg: 'bg-accent-primary/10',
      change: `${analytics.activeCount} active`,
    },
    {
      label: 'Linked Customers',
      value: analytics.totalCustomers,
      icon: <Users size={24} />,
      color: 'text-blue-600',
      bg: 'bg-blue-500/10',
      change: `across ${analytics.total} companies`,
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
      label: 'Pending Approval',
      value: analytics.inactiveCount,
      icon: <Clock size={24} />,
      color: 'text-amber-600',
      bg: 'bg-amber-500/10',
      change: `${analytics.suspendedCount} suspended`,
    },
  ];

  // ── Actions by status ────────────────────────────────────────────────
  const getAvailableActions = (company) => {
    switch (company.status) {
      case 'inactive':
        return [{ action: 'active', label: 'Approve', icon: <CheckCircle2 size={14} />, color: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 hover:bg-emerald-100' }];
      case 'active':
        return [
          { action: 'inactive', label: 'Deactivate', icon: <Pause size={14} />, color: 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 hover:bg-amber-100' },
          { action: 'suspended', label: 'Suspend', icon: <Ban size={14} />, color: 'bg-red-50 dark:bg-red-950/30 text-red-500 hover:bg-red-100' },
        ];
      case 'suspended':
        return [{ action: 'active', label: 'Reactivate', icon: <Play size={14} />, color: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 hover:bg-emerald-100' }];
      default:
        return [];
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
              {analytics.inactiveCount} pending approval
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
                          {company.primary_admin ? (
                            <div>
                              <p className="text-sm font-semibold text-text-primary truncate max-w-[160px]">
                                {[company.primary_admin.first_name, company.primary_admin.last_name].filter(Boolean).join(' ') || company.primary_admin.email}
                              </p>
                              <p className="text-[10px] text-text-secondary font-medium truncate max-w-[160px]">
                                {company.primary_admin.email}
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
                            <span className="text-sm font-bold text-text-primary">{company.customer_count}</span>
                          </div>
                        </td>

                        {/* Credit Limit */}
                        <td className="px-6 py-5">
                          <p className="text-sm font-black text-text-primary">{fmtPrice(company.credit_limit)}</p>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-[2rem] p-8 shadow-2xl border border-stone-100 dark:border-slate-700 text-center"
            >
              <div className={`inline-flex p-3 rounded-full mb-4 ${
                confirmModal.newStatus === 'active'
                  ? 'bg-emerald-500/10 text-emerald-600'
                  : confirmModal.newStatus === 'suspended'
                    ? 'bg-red-500/10 text-red-500'
                    : 'bg-amber-500/10 text-amber-600'
              }`}>
                {confirmModal.newStatus === 'active' ? <CheckCircle2 size={28} /> : <AlertTriangle size={28} />}
              </div>

              <h3 className="text-2xl font-black text-text-primary mb-2 capitalize">
                {confirmModal.newStatus === 'active'
                  ? 'Approve Company'
                  : confirmModal.newStatus === 'suspended'
                    ? 'Suspend Company'
                    : 'Deactivate Company'}
              </h3>
              <p className="text-sm text-text-secondary mb-2 leading-relaxed">
                <strong className="text-text-primary">{confirmModal.company.company_name}</strong> will be
                {' '}{confirmModal.newStatus === 'active'
                  ? 'approved and activated.'
                  : confirmModal.newStatus === 'suspended'
                    ? 'suspended and will not be able to submit new quotes.'
                    : 'deactivated.'
                }
              </p>
              <p className="text-xs text-text-secondary mb-8">
                Current status: <span className="font-bold">{confirmModal.company.status}</span>
                {' → '}
                <span className="font-bold">{confirmModal.newStatus}</span>
              </p>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 text-xs font-black uppercase tracking-wider"
                  onClick={() => setConfirmModal(null)}
                >
                  Cancel
                </Button>
                <Button
                  className={`flex-1 text-xs font-black uppercase tracking-wider ${
                    confirmModal.newStatus === 'active'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : confirmModal.newStatus === 'suspended'
                        ? 'bg-red-600 hover:bg-red-700'
                        : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                  onClick={handleStatusUpdate}
                >
                  Confirm
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
