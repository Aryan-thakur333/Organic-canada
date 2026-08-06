import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Plus,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Send,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Scale,
  RefreshCw,
  Package,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import Button from '../components/common/Button';
import { b2bApi } from '../services/b2bApi';
import { extractB2BQuotes } from '../utils/b2bProductsResponse';
import {
  QUOTE_STATUS_OPTIONS,
  formatMinorCurrency,
  getQuoteItemCount,
  getQuoteOriginalTotalMinor,
  getQuoteStatusLabel,
  getQuoteTotalMinor,
  getQuoteTotalUnits,
  normalizeQuote,
  quoteMatchesStatusGroup,
  shouldShowAdjustedTotal,
  toNumber,
} from '../utils/b2bQuoteNormalize';
import useB2BCompany from '../hooks/useB2BCompany';
import useToast from '../hooks/useToast';

// ── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

// ── Helpers ────────────────────────────────────────────────────────────────

/** Format cents → $X.XX */
const fmtPrice = (cents, currencyCode = 'cad') => formatMinorCurrency(cents, currencyCode);

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
    case 'pending_merchant':
    case 'pending_review':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800/25';
    case 'pending_customer':
    case 'approved':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/25';
    case 'accepted':
      return 'bg-teal-100 text-teal-700 dark:bg-teal-950/30 dark:text-teal-400 border border-teal-200 dark:border-teal-800/25';
    case 'rejected':
    case 'customer_rejected':
    case 'merchant_rejected':
      return 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400 border border-red-200 dark:border-red-800/25';
    case 'expired':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800/25';
    case 'converted':
    case 'converted_to_order':
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
    case 'pending_merchant':
    case 'pending_review':
      return <Clock size={16} className="text-blue-500" />;
    case 'pending_customer':
    case 'approved':
    case 'accepted':
      return <CheckCircle2 size={16} className="text-emerald-500" />;
    case 'rejected':
    case 'customer_rejected':
    case 'merchant_rejected':
      return <XCircle size={16} className="text-red-500" />;
    case 'expired':
      return <XCircle size={16} className="text-amber-500" />;
    case 'converted':
    case 'converted_to_order':
      return <Send size={16} className="text-purple-500" />;
    default:
      return <FileText size={16} className="text-stone-500" />;
  }
};

const STATUS_OPTIONS = QUOTE_STATUS_OPTIONS;

// ── Component ──────────────────────────────────────────────────────────────

const B2BQuoteHistory = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { company } = useB2BCompany();

  // ── State ─────────────────────────────────────────────────────────────
  const [quotes, setQuotes] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [offset, setOffset] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [actionLoading, setActionLoading] = useState(null);
  const [acceptModalQuote, setAcceptModalQuote] = useState(null);
  const [rejectModalQuote, setRejectModalQuote] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const limit = PAGE_SIZE;

  // ── Derived pagination ────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(count / limit));
  const currentPage = Math.floor(offset / limit) + 1;

  const { id } = useParams();
  const requestSeqRef = useRef(0);

  // ── Fetch quotes ──────────────────────────────────────────────────────
  const fetchQuotes = useCallback(async (signal) => {
    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;

    try {
      setLoading(true);
      setError(null);
      const params = { limit: statusFilter ? 100 : limit, offset: statusFilter ? 0 : offset };
      const res = await b2bApi.getQuotes({ ...params, signal });
      if (signal?.aborted || requestSeqRef.current !== requestId) return;

      let list = extractB2BQuotes(res).map((quote) => normalizeQuote(quote, { currentCompany: company }));
      if (statusFilter) {
        list = list.filter((quote) => quoteMatchesStatusGroup(quote, statusFilter));
      }
      let total = statusFilter ? list.length : (res?.count || list.length);
      
      // If we have an id from route params, make sure it is in the list
      if (id && !list.some(q => q.id === id)) {
        try {
          const singleQuoteRes = await b2bApi.getQuote(id, { signal });
          if (signal?.aborted || requestSeqRef.current !== requestId) return;
          if (singleQuoteRes?.quote) {
            list = [normalizeQuote(singleQuoteRes.quote, { currentCompany: company }), ...list];
            total += 1;
          }
        } catch (e) {
          // ignore
        }
      }
      
      setQuotes(list);
      setCount(total);
      if (id) {
        setExpandedId(id);
      }
    } catch (err) {
      if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED' || err?.message === 'canceled') return;
      const msg = err?.response?.data?.message || err?.message || 'Failed to load quotes';
      setError(msg);
      setQuotes([]);
      setCount(0);
    } finally {
      if (!signal?.aborted && requestSeqRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [statusFilter, offset, limit, id, refreshKey, company]);

  useEffect(() => {
    const controller = new AbortController();
    fetchQuotes(controller.signal);

    return () => {
      controller.abort();
    };
  }, [fetchQuotes]);

  const handleRefresh = () => {
    setRefreshKey((value) => value + 1);
  };

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

  const acceptQuote = async (quote) => {
    if (actionLoading) return;
    setActionLoading(quote.id);
    try {
      await b2bApi.acceptQuote(quote.id, {
        offer_version: quote.offer_version,
        settlement_mode: 'online',
      });
      showToast('Quote accepted. Order created.', 'success');
      setAcceptModalQuote(null);
      handleRefresh();
      navigate(`/b2b/quotes/${quote.id}/checkout`);
    } catch (error) {
      showToast(error?.message || 'Unable to accept quote', 'error');
    } finally { setActionLoading(null); }
  };

  const rejectQuote = async () => {
    if (!rejectModalQuote || actionLoading) return;
    setActionLoading(rejectModalQuote.id);
    try {
      await b2bApi.rejectQuote(rejectModalQuote.id, { reason: rejectReason });
      showToast('Quote rejected.', 'success');
      setRejectModalQuote(null);
      setRejectReason('');
      handleRefresh();
    } catch (error) {
      showToast(error?.message || 'Unable to reject quote', 'error');
    } finally { setActionLoading(null); }
  };

  // ── Derived ────────────────────────────────────────────────────────────
  const activeQuotes = quotes.filter((q) => q.status === 'draft' || q.status === 'pending' || q.status === 'pending_merchant' || q.status === 'pending_review' || q.status === 'pending_customer');
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
            onClick={() => navigate('/b2b/request-quote')}
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
            onClick={handleRefresh}
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
        ) : error ? (
          <div className="py-24 text-center max-w-xl mx-auto bg-white dark:bg-slate-800 p-12 rounded-[2.5rem] border border-red-100 dark:border-red-900/30 shadow-premium">
            <div className="inline-flex p-6 rounded-full bg-red-100 dark:bg-red-950/30 text-red-500 mb-6">
              <AlertCircle size={48} />
            </div>
            <h2 className="text-3xl font-black mb-4">Could not load B2B quotes</h2>
            <p className="text-text-secondary mb-8 leading-relaxed">{error}</p>
            <Button size="lg" className="gap-2" onClick={handleRefresh}>
              <RefreshCw size={18} /> Retry
            </Button>
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
                <Button size="lg" className="gap-2" onClick={() => navigate('/b2b/request-quote')}>
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
                            {quote.status_label || getQuoteStatusLabel(quote.status)}
                          </span>
                        </div>
                        <p className="text-xs text-text-secondary">
                          {fmtDate(quote.created_at)} · {getQuoteItemCount(quote)} item(s) · {getQuoteTotalUnits(quote)} unit(s) · {fmtPrice(getQuoteTotalMinor(quote), quote.currency_code)}
                        </p>
                      </div>

                      {shouldShowAdjustedTotal(quote) && (
                        <div className="text-right hidden sm:block">
                          <p className="text-[10px] text-text-secondary font-black uppercase tracking-wider">
                            Adjusted
                          </p>
                          <p className="text-sm font-black text-accent-primary">
                            {fmtPrice(getQuoteTotalMinor(quote), quote.currency_code)}
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
                                  Quote ID
                                </p>
                                <p className="font-mono font-bold text-text-primary">{quote.id}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-text-secondary font-black uppercase tracking-widest mb-1">
                                  Company Name
                                </p>
                                <p className="font-bold text-text-primary">{quote.company_display_name || '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-text-secondary font-black uppercase tracking-widest mb-1">
                                  Customer Email
                                </p>
                                <p className="font-bold text-text-primary">{quote.customer_display_email || '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-text-secondary font-black uppercase tracking-widest mb-1">
                                  Created Date
                                </p>
                                <p className="font-bold text-text-primary">{fmtDate(quote.created_at)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-text-secondary font-black uppercase tracking-widest mb-1">
                                  Expiry Date
                                </p>
                                <p className="font-bold text-text-primary">{fmtDate(quote.expires_at)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-text-secondary font-black uppercase tracking-widest mb-1">
                                  Total
                                </p>
                                <p className="font-bold text-text-primary">{fmtPrice(getQuoteTotalMinor(quote), quote.currency_code)}</p>
                              </div>
                            </div>

                            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-2xl text-xs">
                              <p className="font-bold text-blue-700 dark:text-blue-300">
                                {quote.status === 'pending_customer'
                                  ? 'Merchant has sent a negotiated offer. Please accept or reject.'
                                  : quote.status === 'pending_merchant' || quote.status === 'pending_review'
                                    ? 'Your quote is under review. We will notify you when the offer is ready.'
                                    : quote.status === 'accepted'
                                      ? 'Quote accepted.'
                                      : quote.status === 'customer_rejected'
                                        ? 'You rejected this quote.'
                                        : quote.status === 'merchant_rejected'
                                          ? 'Merchant rejected this quote.'
                                          : getQuoteStatusLabel(quote.status)}
                              </p>
                              {quote.status === 'merchant_rejected' && quote.rejection_reason && (
                                <p className="mt-1 text-blue-700 dark:text-blue-300">{quote.rejection_reason}</p>
                              )}
                            </div>

                            {/* Line items */}
                            {quote.items?.length > 0 && (
                              <div className="mt-4 space-y-2">
                                <p className="text-[10px] font-black uppercase tracking-widest text-text-secondary">
                                  Line Items ({getQuoteItemCount(quote)})
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
                                      {(() => {
                                        const quantity = toNumber(item.quantity, 0);
                                        const unitPrice = toNumber(item.negotiated_unit_price ?? item.unit_price ?? item.requested_unit_price, 0);
                                        const lineTotal = toNumber(item.line_total ?? item.total, unitPrice * quantity);
                                        return (
                                          <>
                                            <span className="text-text-secondary font-medium">x{quantity}</span>
                                            <span className="font-bold text-text-primary w-20 text-right">
                                              {fmtPrice(unitPrice, quote.currency_code)}
                                            </span>
                                            <span className="font-black text-text-primary w-20 text-right">
                                              {fmtPrice(lineTotal, quote.currency_code)}
                                            </span>
                                          </>
                                        );
                                      })()}
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
                            {shouldShowAdjustedTotal(quote) && (
                              <div className="mt-4 flex items-center gap-4 p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl text-xs">
                                <Scale size={18} className="text-emerald-500 shrink-0" />
                                <div>
                                  <p className="font-bold text-emerald-700 dark:text-emerald-300">
                                    Offer Total: {fmtPrice(getQuoteTotalMinor(quote), quote.currency_code)}
                                  </p>
                                  <p className="text-emerald-600 dark:text-emerald-400 font-medium">
                                    {getQuoteOriginalTotalMinor(quote) > getQuoteTotalMinor(quote)
                                      ? `You saved ${fmtPrice(getQuoteOriginalTotalMinor(quote) - getQuoteTotalMinor(quote), quote.currency_code)}`
                                      : `Adjusted from ${fmtPrice(getQuoteOriginalTotalMinor(quote), quote.currency_code)}`}
                                  </p>
                                </div>
                              </div>
                            )}
                            {quote.status === 'pending_customer' && (
                              <div className="mt-4 flex flex-wrap gap-3">
                                <Button disabled={actionLoading === quote.id} onClick={() => setAcceptModalQuote(quote)}>
                                  {actionLoading === quote.id ? 'Accepting...' : 'Accept Quote'}
                                </Button>
                                <Button variant="secondary" disabled={actionLoading === quote.id} onClick={() => setRejectModalQuote(quote)}>
                                  Reject Quote
                                </Button>
                              </div>
                            )}
                            {quote.status === 'accepted' && (
                              <div className="mt-4 flex flex-wrap gap-3">
                                <Button onClick={() => navigate(`/b2b/quotes/${quote.id}/checkout`)}>
                                  Pay Quote
                                </Button>
                                <Button variant="secondary" onClick={() => navigate(`/b2b/quotes/${quote.id}`)}>
                                  View Details
                                </Button>
                                <Button variant="secondary" onClick={() => navigate('/orders')}>
                                  View Order
                                </Button>
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

      <AnimatePresence>
        {acceptModalQuote && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-premium border border-stone-100 dark:border-slate-700"
              initial={{ scale: 0.96, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 10 }}
            >
              <h2 className="text-xl font-black text-text-primary mb-2">Accept this quote?</h2>
              <p className="text-sm text-text-secondary mb-6">
                Accept this quote and create an order for {fmtPrice(getQuoteTotalMinor(acceptModalQuote), acceptModalQuote.currency_code)}?
              </p>
              <div className="flex justify-end gap-3">
                <Button variant="secondary" disabled={actionLoading === acceptModalQuote.id} onClick={() => setAcceptModalQuote(null)}>
                  Cancel
                </Button>
                <Button disabled={actionLoading === acceptModalQuote.id} onClick={() => acceptQuote(acceptModalQuote)}>
                  {actionLoading === acceptModalQuote.id ? 'Accepting...' : 'Accept Quote'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {rejectModalQuote && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 p-6 shadow-premium border border-stone-100 dark:border-slate-700"
              initial={{ scale: 0.96, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 10 }}
            >
              <h2 className="text-xl font-black text-text-primary mb-2">Reject this quote?</h2>
              <p className="text-sm text-text-secondary mb-4">
                You can add an optional reason for the merchant.
              </p>
              <textarea
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                rows={4}
                className="w-full rounded-2xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-3 text-sm text-text-primary outline-none focus:border-accent-primary"
                placeholder="Optional reason"
              />
              <div className="flex justify-end gap-3 mt-6">
                <Button
                  variant="secondary"
                  disabled={actionLoading === rejectModalQuote.id}
                  onClick={() => {
                    setRejectModalQuote(null);
                    setRejectReason('');
                  }}
                >
                  Cancel
                </Button>
                <Button disabled={actionLoading === rejectModalQuote.id} onClick={rejectQuote}>
                  {actionLoading === rejectModalQuote.id ? 'Rejecting...' : 'Reject Quote'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
