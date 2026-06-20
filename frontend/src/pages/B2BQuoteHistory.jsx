import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Plus,
  Building2,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Send,
  Eye,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Scale,
  RefreshCw,
  Calendar,
  Package,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import Button from '../components/common/Button';
import { b2bApi } from '../services/b2bApi';
import useToast from '../hooks/useToast';

// ── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

// ── Helpers ────────────────────────────────────────────────────────────────

/** Format cents → $X.XX */
const fmtPrice = (cents) => `$${(cents / 100).toFixed(2)}`;

/** Format ISO date → friendly string */
const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/** Status badge styling matching the subscription pattern */
const getStatusStyle = (status) => {
  switch (status) {
    case 'draft':
      return 'bg-stone-100 text-stone-600 dark:bg-slate-700 dark:text-stone-300 border border-stone-200 dark:border-slate-600';
    case 'pending':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800/25';
    case 'approved':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/25';
    case 'rejected':
      return 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400 border border-red-200 dark:border-red-800/25';
    case 'converted':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400 border border-purple-200 dark:border-purple-800/25';
    default:
      return 'bg-stone-100 text-stone-600 dark:bg-slate-800 dark:text-slate-400 border border-stone-200 dark:border-slate-700';
  }
};

/** Status icon */
const StatusIcon = ({ status }) => {
  switch (status) {
    case 'draft':
      return <FileText size={16} className="text-stone-500" />;
    case 'pending':
      return <Clock size={16} className="text-blue-500" />;
    case 'approved':
      return <CheckCircle2 size={16} className="text-emerald-500" />;
    case 'rejected':
      return <XCircle size={16} className="text-red-500" />;
    case 'converted':
      return <Send size={16} className="text-purple-500" />;
    default:
      return <FileText size={16} className="text-stone-500" />;
  }
};

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'converted', label: 'Converted' },
];

// ── Component ──────────────────────────────────────────────────────────────

const B2BQuoteHistory = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  // ── State ─────────────────────────────────────────────────────────────
  const [quotes, setQuotes] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [offset, setOffset] = useState(0);
  const limit = PAGE_SIZE;

  // ── Derived pagination ────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(count / limit));
  const currentPage = Math.floor(offset / limit) + 1;

  // ── Fetch quotes ──────────────────────────────────────────────────────
  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit, offset };
      if (statusFilter) params.status = statusFilter;
      const res = await b2bApi.getQuotes(params);
      setQuotes(res?.quotes || []);
      setCount(res?.count || 0);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to load quotes';
      showToast(msg, 'error');
      setQuotes([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, offset, limit, showToast]);

  useEffect(() => {
    fetchQuotes();
  }, [fetchQuotes]);

  // Reset to first page on filter change
  const handleStatusFilter = (value) => {
    setStatusFilter(value);
    setOffset(0);
    setExpandedId(null);
  };

  // ── Page navigation ───────────────────────────────────────────────────
  const goToPage = (page) => {
    const clamped = Math.max(1, Math.min(page, totalPages));
    setOffset((clamped - 1) * limit);
    setExpandedId(null);
  };

  const atFirstPage = currentPage <= 1;
  const atLastPage = currentPage >= totalPages;

  // ── Derived ────────────────────────────────────────────────────────────
  const activeQuotes = quotes.filter((q) => q.status === 'draft' || q.status === 'pending');
  const resolvedQuotes = quotes.filter((q) => q.status === 'approved' || q.status === 'rejected' || q.status === 'converted');

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
            <h1 className="text-4xl font-black text-text-primary">Quote History.</h1>
            <p className="text-sm text-text-secondary">
              Track all your wholesale quote requests — {count} total
              {activeQuotes.length > 0 && `, ${activeQuotes.length} active`}.
            </p>
          </div>
          <Button
            size="md"
            className="gap-2 text-xs font-black uppercase tracking-wider"
            onClick={() => navigate('/dashboard/b2b/quotes')}
          >
            <Plus size={16} /> New Quote
          </Button>
        </div>

        {/* ── Filter bar ────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <span className="text-xs font-black uppercase tracking-widest text-text-secondary">
            Filter:
          </span>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleStatusFilter(opt.value)}
              className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                statusFilter === opt.value
                  ? 'bg-accent-primary text-white shadow-lg shadow-accent-primary/20'
                  : 'bg-white dark:bg-slate-800 text-text-secondary border border-stone-200 dark:border-slate-700 hover:border-accent-primary/30 hover:text-text-primary'
              }`}
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={fetchQuotes}
            className="ml-auto p-2 rounded-full hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors text-text-secondary hover:text-text-primary"
            title="Refresh"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* ── Loading state ─────────────────────────────────────────────── */}
        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-28 bg-white dark:bg-slate-800 rounded-[2rem] border border-stone-100 dark:border-slate-700 animate-pulse"
              />
            ))}
          </div>
        ) : quotes.length === 0 ? (
          /* ── Empty state ─────────────────────────────────────────────── */
          <div className="py-24 text-center max-w-xl mx-auto bg-white dark:bg-slate-800 p-12 rounded-[2.5rem] border border-stone-100 dark:border-slate-700 shadow-premium">
            <div className="inline-flex p-8 rounded-full bg-stone-100 dark:bg-slate-700 text-stone-400 mb-8">
              <FileText size={64} />
            </div>
            {statusFilter ? (
              <>
                <h2 className="text-3xl font-black mb-4">No {statusFilter} quotes</h2>
                <p className="text-text-secondary mb-10 leading-relaxed">
                  No quotes with status &ldquo;{statusFilter}&rdquo; found.
                  Try a different filter or clear it to see all your quotes.
                </p>
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => handleStatusFilter('')}
                >
                  Clear Filter
                </Button>
              </>
            ) : (
              <>
                <h2 className="text-3xl font-black mb-4">No quotes yet</h2>
                <p className="text-text-secondary mb-10 leading-relaxed">
                  You haven't submitted any wholesale quote requests.
                  Submit your first bulk order quote and track its status here.
                </p>
                <Button size="lg" className="gap-2" onClick={() => navigate('/dashboard/b2b/quotes')}>
                  <Plus size={20} /> Submit a Wholesale Quote
                </Button>
              </>
            )}
          </div>
        ) : (
          <>
            {/* ── Quote list ──────────────────────────────────────────────── */}
            <div className="space-y-4">
              <AnimatePresence mode="popLayout">
                {quotes.map((quote, i) => (
                  <motion.div
                    key={quote.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: i * 0.03, duration: 0.2 }}
                    className="bg-white dark:bg-slate-800 rounded-[2rem] border border-stone-100 dark:border-slate-700 shadow-sm hover:shadow-premium transition-shadow overflow-hidden"
                  >
                    {/* ── Collapsed row ────────────────────────────────────── */}
                    <button
                      onClick={() => setExpandedId(expandedId === quote.id ? null : quote.id)}
                      className="w-full flex items-center gap-4 p-5 text-left hover:bg-stone-50/50 dark:hover:bg-slate-750/50 transition-colors"
                    >
                      {/* Status icon */}
                      <div className="w-10 h-10 rounded-xl bg-stone-50 dark:bg-slate-900/50 flex items-center justify-center shrink-0">
                        <StatusIcon status={quote.status} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-bold text-text-primary">
                            #{quote.id?.slice(-8).toUpperCase()}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${getStatusStyle(quote.status)}`}
                          >
                            {quote.status}
                          </span>
                        </div>
                        <p className="text-xs text-text-secondary">
                          {fmtDate(quote.created_at)} · {quote.items?.length || 0} item(s) · {fmtPrice(quote.subtotal)}
                        </p>
                      </div>

                      {/* Negotiated total (if approved with override) */}
                      {quote.negotiated_total != null && quote.negotiated_total !== quote.subtotal && (
                        <div className="text-right hidden sm:block">
                          <p className="text-[10px] text-text-secondary font-black uppercase tracking-wider">
                            Negotiated
                          </p>
                          <p className="text-sm font-black text-accent-primary">
                            {fmtPrice(quote.negotiated_total)}
                          </p>
                        </div>
                      )}

                      {/* Chevron */}
                      <ChevronLeft
                        size={18}
                        className={`text-stone-300 shrink-0 transition-transform duration-200 ${
                          expandedId === quote.id ? 'rotate-90' : ''
                        }`}
                      />
                    </button>

                    {/* ── Expanded detail ──────────────────────────────────── */}
                    <AnimatePresence>
                      {expandedId === quote.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 pb-5 pt-0 border-t border-stone-100 dark:border-slate-700/50">
                            <div className="grid sm:grid-cols-3 gap-4 p-4 mt-4 bg-stone-50 dark:bg-slate-900/40 rounded-2xl text-xs">
                              <div>
                                <p className="text-[10px] text-text-secondary font-black uppercase tracking-widest mb-1">
                                  Submitted
                                </p>
                                <p className="font-bold text-text-primary">{fmtDate(quote.created_at)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-text-secondary font-black uppercase tracking-widest mb-1">
                                  Last Updated
                                </p>
                                <p className="font-bold text-text-primary">{fmtDate(quote.updated_at)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-text-secondary font-black uppercase tracking-widest mb-1">
                                  Subtotal
                                </p>
                                <p className="font-bold text-text-primary">{fmtPrice(quote.subtotal)}</p>
                              </div>
                            </div>

                            {/* Line items */}
                            {quote.items?.length > 0 && (
                              <div className="mt-4 space-y-2">
                                <p className="text-[10px] font-black uppercase tracking-widest text-text-secondary">
                                  Line Items ({quote.items.length})
                                </p>
                                {quote.items.map((item, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-xl border border-stone-100 dark:border-slate-700/50 text-xs"
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className="w-7 h-7 rounded-lg bg-accent-primary/5 text-accent-primary flex items-center justify-center shrink-0">
                                        <Package size={14} />
                                      </div>
                                      <div className="min-w-0">
                                        <p className="font-bold text-text-primary truncate">
                                          {item.title}
                                        </p>
                                        {item.sku && (
                                          <p className="text-[10px] text-text-secondary font-medium">{item.sku}</p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-4 shrink-0">
                                      <span className="text-text-secondary font-medium">×{item.quantity}</span>
                                      <span className="font-bold text-text-primary w-16 text-right">
                                        {fmtPrice(item.unit_price)}
                                      </span>
                                      <span className="font-black text-text-primary w-16 text-right">
                                        {fmtPrice((item.unit_price || 0) * (item.quantity || 0))}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Admin notes */}
                            {quote.admin_notes && (
                              <div className="mt-4 p-4 bg-stone-50 dark:bg-slate-900/40 rounded-2xl text-xs">
                                <p className="text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1">
                                  Reviewer Notes
                                </p>
                                <p className="font-medium text-text-primary whitespace-pre-wrap">
                                  {quote.admin_notes}
                                </p>
                              </div>
                            )}

                            {/* Negotiation info */}
                            {quote.negotiated_total != null && (
                              <div className="mt-4 flex items-center gap-4 p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl text-xs">
                                <Scale size={18} className="text-emerald-500 shrink-0" />
                                <div>
                                  <p className="font-bold text-emerald-700 dark:text-emerald-300">
                                    Negotiated Price: {fmtPrice(quote.negotiated_total)}
                                  </p>
                                  {quote.negotiated_total !== quote.subtotal && (
                                    <p className="text-emerald-600 dark:text-emerald-400 font-medium">
                                      {(quote.subtotal - quote.negotiated_total) > 0
                                        ? `You saved ${fmtPrice(quote.subtotal - quote.negotiated_total)}`
                                        : `Adjusted from ${fmtPrice(quote.subtotal)}`}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* ── Pagination ──────────────────────────────────────────────── */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-10">
                {/* First page */}
                <button
                  onClick={() => goToPage(1)}
                  disabled={atFirstPage}
                  className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 text-text-secondary hover:text-text-primary hover:border-accent-primary/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  title="First page"
                >
                  <ChevronsLeft size={16} />
                </button>

                {/* Previous */}
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={atFirstPage}
                  className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 text-text-secondary hover:text-text-primary hover:border-accent-primary/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Previous page"
                >
                  <ChevronLeft size={16} />
                </button>

                {/* Page numbers */}
                <div className="flex items-center gap-1 px-2">
                  {generatePageNumbers(currentPage, totalPages).map((page, idx) =>
                    page === '...' ? (
                      <span key={`ellipsis-${idx}`} className="px-2 text-xs text-text-secondary select-none">
                        ...
                      </span>
                    ) : (
                      <button
                        key={page}
                        onClick={() => goToPage(page)}
                        className={`min-w-[36px] h-9 rounded-xl text-xs font-black transition-all ${
                          currentPage === page
                            ? 'bg-accent-primary text-white shadow-md shadow-accent-primary/20'
                            : 'bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 text-text-secondary hover:text-text-primary hover:border-accent-primary/30'
                        }`}
                      >
                        {page}
                      </button>
                    )
                  )}
                </div>

                {/* Next */}
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={atLastPage}
                  className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 text-text-secondary hover:text-text-primary hover:border-accent-primary/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Next page"
                >
                  <ChevronRight size={16} />
                </button>

                {/* Last page */}
                <button
                  onClick={() => goToPage(totalPages)}
                  disabled={atLastPage}
                  className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 text-text-secondary hover:text-text-primary hover:border-accent-primary/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Last page"
                >
                  <ChevronsRight size={16} />
                </button>

                {/* Page info */}
                <span className="ml-4 text-[11px] font-bold text-text-secondary whitespace-nowrap">
                  Page {currentPage} of {totalPages}
                </span>
              </div>
            )}
          </>
        )}
      </main>

      <Footer />
      <MobileNav />
    </div>
  );
};

// ── Pagination helper ──────────────────────────────────────────────────────

/**
 * Generate a compact page number array with ellipsis gaps.
 * E.g. [1, '...', 4, 5, 6, '...', 20]
 */
function generatePageNumbers(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages = [];
  // Always show first page
  pages.push(1);

  if (current > 3) {
    pages.push('...');
  }

  // Pages around current
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) {
    pages.push('...');
  }

  // Always show last page
  if (total > 1) {
    pages.push(total);
  }

  return pages;
}

export default B2BQuoteHistory;
