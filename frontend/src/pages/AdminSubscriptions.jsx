import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  Users,
  DollarSign,
  TrendingDown,
  RefreshCw,
  Filter,
  ChevronLeft,
  Pause,
  Play,
  X,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Calendar,
  Search,
  ArrowUpRight,
  Repeat
} from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import Button from '../components/common/Button';
import { adminSubscriptionService } from '../services/medusa/subscriptionService';
import useToast from '../hooks/useToast';

const STATUS_FILTERS = ['all', 'active', 'paused', 'past_due', 'cancelled', 'expired', 'trialing'];

const STATUS_STYLES = {
  active:    'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  trialing:  'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  paused:    'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  past_due:  'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
  cancelled: 'bg-stone-100 text-stone-600 dark:bg-slate-800 dark:text-slate-400',
  expired:   'bg-stone-100 text-stone-600 dark:bg-slate-800 dark:text-slate-400',
};

const PLAN_LABELS = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };

export default function AdminSubscriptions() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [subscriptions, setSubscriptions] = useState([]);
  const [analytics, setAnalytics] = useState({ total: 0, active: 0, paused: 0, cancelled: 0, past_due: 0, mrr: 0, churn_rate: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await adminSubscriptionService.list();
      setSubscriptions(res.subscriptions || []);
      setAnalytics(res.analytics || {});
    } catch (err) {
      showToast('Failed to load subscriptions', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleAction = async (id, status) => {
    setActionLoading(id);
    setConfirmModal(null);
    try {
      const res = await adminSubscriptionService.updateStatus(id, status);
      const updated = res.subscription;
      setSubscriptions(prev => prev.map(s => s.id === id ? { ...s, ...updated } : s));
      showToast(`Subscription ${status} successfully`, 'success');
    } catch (err) {
      showToast(`Failed to update subscription`, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = useMemo(() => {
    let list = subscriptions;
    if (statusFilter !== 'all') list = list.filter(s => s.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.customer_email?.toLowerCase().includes(q) ||
        s.product_title?.toLowerCase().includes(q) ||
        s.id?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [subscriptions, statusFilter, search]);

  const analyticsCards = [
    {
      label: 'Active Subscriptions',
      value: analytics.active ?? 0,
      icon: <Users size={24} />,
      color: 'text-green-600',
      bg: 'bg-green-500/10',
      change: `${analytics.total ?? 0} total`,
    },
    {
      label: 'Monthly Recurring Revenue',
      value: `$${(analytics.mrr ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: <DollarSign size={24} />,
      color: 'text-accent-primary',
      bg: 'bg-accent-primary/10',
      change: 'est. from active plans',
    },
    {
      label: 'Churn Rate',
      value: `${(analytics.churn_rate ?? 0).toFixed(1)}%`,
      icon: <TrendingDown size={24} />,
      color: 'text-red-500',
      bg: 'bg-red-500/10',
      change: `${analytics.cancelled ?? 0} cancelled`,
    },
    {
      label: 'Renewal Success Rate',
      value: `${analytics.renewal_success_rate ?? 100}%`,
      icon: <CheckCircle2 size={24} className="text-green-600" />,
      color: 'text-green-600',
      bg: 'bg-green-500/10',
      change: `${analytics.failed_renewals ?? 0} failed renewals`,
    },
  ];

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />

      <main className="pt-32 pb-20 container-custom">
        {/* Header */}
        <div className="flex items-center gap-4 mb-10">
          <button onClick={() => navigate('/admin')} className="p-2 rounded-full hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors">
            <ChevronLeft size={24} />
          </button>
          <div className="flex-1">
            <h1 className="text-4xl font-black text-text-primary">Subscriptions Admin.</h1>
            <p className="text-sm text-text-secondary">Monitor, manage, and control all customer subscriptions and recurring revenue.</p>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 text-sm font-bold text-accent-primary hover:text-accent-secondary transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {/* Analytics Cards */}
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

        {/* Filters & Search */}
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
                {f === 'all' ? 'All' : f.replace('_', ' ')}
              </button>
            ))}
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary" size={16} />
            <input
              type="text"
              placeholder="Search email, product, ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-stone-50 dark:bg-slate-900 border-2 border-transparent focus:border-accent-primary rounded-2xl text-sm font-semibold outline-none transition-all"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-premium border border-stone-100 dark:border-slate-700 overflow-hidden">
          <div className="p-8 border-b border-stone-50 dark:border-slate-700 flex items-center justify-between">
            <h2 className="text-xl font-black">Subscriptions ({filtered.length})</h2>
            <span className="text-xs font-bold text-text-secondary">
              {analytics.active ?? 0} active · ${(analytics.mrr ?? 0).toFixed(2)} MRR
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
              <Repeat size={48} className="mx-auto mb-4 opacity-30" />
              <p className="font-bold">No subscriptions found for this filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-stone-50 dark:bg-slate-900/50">
                  <tr>
                    {['Customer', 'Product', 'Plan', 'Amount', 'Status', 'Next Billing', 'Actions'].map(h => (
                      <th key={h} className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-text-secondary whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50 dark:divide-slate-700/50">
                  <AnimatePresence>
                    {filtered.map((sub, i) => (
                      <motion.tr
                        key={sub.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.04 }}
                        className="hover:bg-stone-50/50 dark:hover:bg-slate-900/20 transition-colors group"
                      >
                        <td className="px-6 py-5">
                          <p className="text-sm font-bold text-text-primary truncate max-w-[180px]">{sub.customer_email}</p>
                          <p className="text-[10px] text-text-secondary font-mono">#{sub.id.slice(-8).toUpperCase()}</p>
                        </td>
                        <td className="px-6 py-5">
                          <p className="text-sm font-semibold text-text-primary truncate max-w-[160px]">
                            {sub.product_title || 'Organic Subscription'}
                          </p>
                        </td>
                        <td className="px-6 py-5">
                          <span className="text-xs font-black uppercase tracking-wider text-text-secondary bg-stone-50 dark:bg-slate-900 px-3 py-1.5 rounded-xl">
                            {PLAN_LABELS[sub.plan] || sub.plan}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <p className="text-sm font-black text-accent-primary">${(sub.amount / 100).toFixed(2)}</p>
                        </td>
                        <td className="px-6 py-5">
                          <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider ${STATUS_STYLES[sub.status] || STATUS_STYLES.cancelled}`}>
                            {sub.status.replace('_', ' ')}
                          </span>
                          {sub.failed_payment_count > 0 && (
                            <p className="text-[10px] text-red-500 font-bold mt-1">{sub.failed_payment_count} fail{sub.failed_payment_count > 1 ? 's' : ''}</p>
                          )}
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
                            <Calendar size={12} />
                            {sub.next_billing_date ? new Date(sub.next_billing_date).toLocaleDateString() : '—'}
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {sub.status === 'active' && (
                              <button
                                title="Pause"
                                disabled={actionLoading === sub.id}
                                onClick={() => setConfirmModal({ id: sub.id, action: 'paused', label: 'pause' })}
                                className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-600 hover:bg-amber-100 transition-colors disabled:opacity-40"
                              >
                                <Pause size={14} />
                              </button>
                            )}
                            {sub.status === 'paused' && (
                              <button
                                title="Resume"
                                disabled={actionLoading === sub.id}
                                onClick={() => setConfirmModal({ id: sub.id, action: 'active', label: 'resume' })}
                                className="p-2 rounded-xl bg-green-50 dark:bg-green-950/30 text-green-600 hover:bg-green-100 transition-colors disabled:opacity-40"
                              >
                                <Play size={14} />
                              </button>
                            )}
                            {(sub.status === 'active' || sub.status === 'paused' || sub.status === 'past_due') && (
                              <button
                                title="Cancel"
                                disabled={actionLoading === sub.id}
                                onClick={() => setConfirmModal({ id: sub.id, action: 'cancelled', label: 'cancel' })}
                                className="p-2 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-40"
                              >
                                <X size={14} />
                              </button>
                            )}
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

      {/* Confirm Modal */}
      <AnimatePresence>
        {confirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-[2rem] p-8 shadow-2xl border border-stone-100 dark:border-slate-700 text-center"
            >
              <AlertTriangle className="mx-auto mb-4 text-accent-primary" size={44} />
              <h3 className="text-2xl font-black mb-2 capitalize">{confirmModal.label} Subscription</h3>
              <p className="text-sm text-text-secondary mb-8">
                This will immediately {confirmModal.label} the subscription. The customer will be notified at their next renewal cycle.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 text-xs font-black uppercase tracking-wider" onClick={() => setConfirmModal(null)}>
                  Cancel
                </Button>
                <Button className="flex-1 text-xs font-black uppercase tracking-wider" onClick={() => handleAction(confirmModal.id, confirmModal.action)}>
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
