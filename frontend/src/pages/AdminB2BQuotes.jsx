import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  Users,
  DollarSign,
  Building2,
  RefreshCw,
  Filter,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  FileText,
  Clock,
  Calendar,
  Package,
  Scale,
  Send,
  ArrowUpRight,
  Loader2,
} from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import Button from '../components/common/Button';
import useToast from '../hooks/useToast';
import { b2bApi } from '../services/b2bApi';

// ── Helpers ────────────────────────────────────────────────────────────────

const fmtPrice = (cents) => `$${(cents / 100).toFixed(2)}`;
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const STATUS_FILTERS = ['all', 'draft', 'pending', 'approved', 'rejected', 'converted'];

const STATUS_STYLES = {
  draft:     'bg-stone-100 text-stone-600 dark:bg-slate-700 dark:text-stone-300 border border-stone-200 dark:border-slate-600',
  pending:   'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200 dark:border-blue-800/25',
  approved:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/25',
  rejected:  'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800/25',
  converted: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border border-purple-200 dark:border-purple-800/25',
};



// ── Component ──────────────────────────────────────────────────────────────

export default function AdminB2BQuotes() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [quotes, setQuotes] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState(null);

  // ── Review modal state ───────────────────────────────────────────────
  const [reviewModal, setReviewModal] = useState(null); // { id, action: 'approved'|'rejected' }
  const [negotiatedTotal, setNegotiatedTotal] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  // ── Fetch ────────────────────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await b2bApi.adminListQuotes(params);
      setQuotes(res.quotes || []);
      setCount(res.count || 0);
    } catch (err) {
      showToast('Failed to load B2B quotes', 'error');
      setQuotes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [statusFilter]);

  // ── Filter + Search ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = quotes;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.customer_email?.toLowerCase().includes(q) ||
        s.id?.toLowerCase().includes(q) ||
        s.company?.company_name?.toLowerCase().includes(q) ||
        s.admin_notes?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [quotes, search]);

  // ── Review action ────────────────────────────────────────────────────
  const handleReview = async () => {
    if (!reviewModal) return;
    const { id, action } = reviewModal;

    // Validate negotiated_total for approval
    if (action === 'approved') {
      const nt = negotiatedTotal.trim();
      if (nt !== '' && (isNaN(parseInt(nt)) || parseInt(nt) < 0)) {
        showToast('Negotiated total must be a non-negative number (cents)', 'error');
        return;
      }
    }

    setActionLoading(id);
    setReviewModal(null);
    try {
      const payload = {
        status: action,
        admin_notes: adminNotes.trim() || undefined,
      };
      if (action === 'approved' && negotiatedTotal.trim() !== '') {
        payload.negotiated_total = parseInt(negotiatedTotal);
      }

      const res = await b2bApi.adminReviewQuote(id, payload);
      const updated = res.quote;

      setQuotes(prev => prev.map(q => q.id === id ? { ...q, ...updated } : q));
      showToast(
        action === 'approved'
          ? `Quote approved and converted to order!`
          : 'Quote rejected',
        'success'
      );
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || `Failed to ${action} quote`;
      showToast(msg, 'error');
    } finally {
      setActionLoading(null);
      setNegotiatedTotal('');
      setAdminNotes('');
    }
  };

  const openReviewModal = (quote, action) => {
    setReviewModal({ id: quote.id, action });
    setNegotiatedTotal(action === 'approved' && quote.negotiated_total ? String(quote.negotiated_total) : '');
    setAdminNotes('');
  };

  // ── Analytics ────────────────────────────────────────────────────────
  const analytics = useMemo(() => {
    const total = quotes.length;
    const draftCount = quotes.filter(q => q.status === 'draft').length;
    const pendingCount = quotes.filter(q => q.status === 'pending').length;
    const approvedCount = quotes.filter(q => q.status === 'approved').length;
    const rejectedCount = quotes.filter(q => q.status === 'rejected').length;
    const convertedCount = quotes.filter(q => q.status === 'converted').length;
    const totalSubtotal = quotes.reduce((sum, q) => sum + (q.subtotal || 0), 0);
    return { total, draftCount, pendingCount, approvedCount, rejectedCount, convertedCount, totalSubtotal };
  }, [quotes]);

  const analyticsCards = [
    {
      label: 'Total Quotes',
      value: analytics.total,
      icon: <FileText size={24} />,
      color: 'text-accent-primary',
      bg: 'bg-accent-primary/10',
      change: `${analytics.pendingCount} pending`,
    },
    {
      label: 'Total Value (subtotal)',
      value: fmtPrice(analytics.totalSubtotal),
      icon: <DollarSign size={24} />,
      color: 'text-emerald-600',
      bg: 'bg-emerald-500/10',
      change: `${analytics.draftCount} draft · ${analytics.pendingCount} pending`,
    },
    {
      label: 'Approval Rate',
      value: analytics.total > 0
        ? `${Math.round(((analytics.approvedCount + analytics.convertedCount) / analytics.total) * 100)}%`
        : '0%',
      icon: <CheckCircle2 size={24} />,
      color: 'text-green-600',
      bg: 'bg-green-500/10',
      change: `${analytics.convertedCount} converted to order`,
    },
    {
      label: 'Rejected',
      value: analytics.rejectedCount,
      icon: <XCircle size={24} />,
      color: 'text-red-500',
      bg: 'bg-red-500/10',
      change: `${analytics.total > 0 ? Math.round((analytics.rejectedCount / analytics.total) * 100) : 0}% of total`,
    },
  ];

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
            <h1 className="text-4xl font-black text-text-primary">B2B Quotes Admin.</h1>
            <p className="text-sm text-text-secondary">Review, negotiate, and approve/reject wholesale quote requests from corporate customers.</p>
          </div>
          <button
            onClick={fetchData}
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
              placeholder="Search email, company, ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-stone-50 dark:bg-slate-900 border-2 border-transparent focus:border-accent-primary rounded-2xl text-sm font-semibold outline-none transition-all"
            />
          </div>
        </div>

        {/* ── Table ─────────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-premium border border-stone-100 dark:border-slate-700 overflow-hidden">
          <div className="p-8 border-b border-stone-50 dark:border-slate-700 flex items-center justify-between">
            <h2 className="text-xl font-black">Quotes ({filtered.length})</h2>
            <span className="text-xs font-bold text-text-secondary">
              {analytics.pendingCount} pending review
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
              <FileText size={48} className="mx-auto mb-4 opacity-30" />
              <p className="font-bold">No quotes found for this filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-stone-50 dark:bg-slate-900/50">
                  <tr>
                    {['ID', 'Company', 'Customer', 'Items', 'Subtotal', 'Negotiated', 'Status', 'Submitted', 'Actions'].map(h => (
                      <th key={h} className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-text-secondary whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50 dark:divide-slate-700/50">
                  <AnimatePresence>
                    {filtered.map((quote, i) => (
                      <motion.tr
                        key={quote.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.03 }}
                        className="hover:bg-stone-50/50 dark:hover:bg-slate-900/20 transition-colors group"
                      >
                        {/* ID */}
                        <td className="px-6 py-5">
                          <span className="text-sm font-black text-accent-primary text-left">
                            #{quote.id?.slice(-8).toUpperCase()}
                          </span>
                        </td>

                        {/* Company */}
                        <td className="px-6 py-5">
                          <p className="text-sm font-bold text-text-primary truncate max-w-[140px]">
                            {quote.company?.company_name || '—'}
                          </p>
                          {quote.company?.tax_id && (
                            <p className="text-[10px] text-text-secondary font-mono">Tax: {quote.company.tax_id}</p>
                          )}
                        </td>

                        {/* Customer */}
                        <td className="px-6 py-5">
                          <p className="text-sm font-semibold text-text-primary truncate max-w-[160px]">{quote.customer_email}</p>
                        </td>

                        {/* Items */}
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-1.5">
                            <Package size={14} className="text-stone-400" />
                            <span className="text-sm font-bold text-text-primary">{quote.items?.length || 0}</span>
                            <span className="text-xs text-text-secondary">items</span>
                          </div>
                        </td>

                        {/* Subtotal */}
                        <td className="px-6 py-5">
                          <p className="text-sm font-black text-text-primary">{fmtPrice(quote.subtotal)}</p>
                        </td>

                        {/* Negotiated */}
                        <td className="px-6 py-5">
                          {quote.negotiated_total != null ? (
                            <p className="text-sm font-black text-accent-primary">{fmtPrice(quote.negotiated_total)}</p>
                          ) : (
                            <span className="text-xs text-text-secondary italic">—</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-6 py-5">
                          <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider ${STATUS_STYLES[quote.status] || STATUS_STYLES.draft}`}>
                            {quote.status}
                          </span>
                        </td>

                        {/* Submitted */}
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
                            <Calendar size={12} />
                            {fmtDate(quote.created_at)}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {(quote.status === 'draft' || quote.status === 'pending') && (
                              <>
                                <button
                                  title="Approve"
                                  disabled={actionLoading === quote.id}
                                  onClick={() => openReviewModal(quote, 'approved')}
                                  className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 hover:bg-emerald-100 transition-colors disabled:opacity-40"
                                >
                                  <CheckCircle2 size={14} />
                                </button>
                                <button
                                  title="Reject"
                                  disabled={actionLoading === quote.id}
                                  onClick={() => openReviewModal(quote, 'rejected')}
                                  className="p-2 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-500 hover:bg-red-100 transition-colors disabled:opacity-40"
                                >
                                  <XCircle size={14} />
                                </button>
                              </>
                            )}
                            {quote.status === 'approved' && (
                              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                <Loader2 size={12} className="animate-spin" /> Converting…
                              </span>
                            )}
                            {quote.status === 'converted' && (
                              <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1">
                                <Send size={12} /> Order created
                              </span>
                            )}
                            {quote.status === 'rejected' && (
                              <span className="text-[10px] font-bold text-red-500">Rejected</span>
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

      {/* ── Review Modal ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {reviewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-white dark:bg-slate-800 rounded-[2rem] p-8 shadow-2xl border border-stone-100 dark:border-slate-700 text-left"
            >
              <div className={`inline-flex p-3 rounded-full mb-4 ${
                reviewModal.action === 'approved'
                  ? 'bg-emerald-500/10 text-emerald-600'
                  : 'bg-red-500/10 text-red-500'
              }`}>
                {reviewModal.action === 'approved' ? <CheckCircle2 size={28} /> : <XCircle size={28} />}
              </div>

              <h3 className="text-2xl font-black text-text-primary mb-2 capitalize">
                {reviewModal.action} Quote
              </h3>
              <p className="text-sm text-text-secondary mb-6 leading-relaxed">
                {reviewModal.action === 'approved'
                  ? 'This will approve the quote and trigger the order conversion workflow. The customer will receive a commercial invoice.'
                  : 'The customer will be notified that their quote has been declined. You can add notes to explain the reason.'}
              </p>

              {/* Negotiated total (approval only) */}
              {reviewModal.action === 'approved' && (
                <div className="mb-5">
                  <label className="block text-xs font-black uppercase tracking-widest text-text-secondary mb-2">
                    Negotiated Total (cents) <span className="text-stone-400 font-normal normal-case">— optional override</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 font-bold">$</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={negotiatedTotal}
                      onChange={e => setNegotiatedTotal(e.target.value)}
                      placeholder="Leave blank to use subtotal"
                      className="w-full pl-8 pr-4 py-3 bg-stone-50 dark:bg-slate-900 border-2 border-transparent focus:border-accent-primary rounded-2xl text-sm font-semibold outline-none transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-text-secondary font-medium mt-1.5">
                    Enter amount in cents (e.g. 45000 = $450.00). Leave empty to keep the quoted subtotal.
                  </p>
                </div>
              )}

              {/* Admin notes */}
              <div className="mb-6">
                <label className="block text-xs font-black uppercase tracking-widest text-text-secondary mb-2">
                  Admin Notes <span className="text-stone-400 font-normal normal-case">— visible to customer</span>
                </label>
                <textarea
                  value={adminNotes}
                  onChange={e => setAdminNotes(e.target.value)}
                  placeholder={reviewModal.action === 'rejected' ? 'Explain why the quote was declined…' : 'Optional notes for the customer…'}
                  rows={3}
                  className="w-full px-4 py-3 bg-stone-50 dark:bg-slate-900 border-2 border-transparent focus:border-accent-primary rounded-2xl text-sm font-semibold outline-none transition-all resize-none"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 text-xs font-black uppercase tracking-wider"
                  onClick={() => {
                    setReviewModal(null);
                    setNegotiatedTotal('');
                    setAdminNotes('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className={`flex-1 text-xs font-black uppercase tracking-wider ${
                    reviewModal.action === 'approved'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                  onClick={handleReview}
                >
                  {reviewModal.action === 'approved' ? 'Approve & Convert' : 'Reject'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
