import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Clock,
  CreditCard,
  FileText,
  Package,
  RefreshCw,
  Scale,
} from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import Button from '../components/common/Button';
import QuoteChat from '../components/b2b/QuoteChat';
import useToast from '../hooks/useToast';
import { b2bApi } from '../services/b2bApi';
import { authService } from '../services/medusa/authService';
import {
  B2B_QUOTE_STATUS,
  canAcceptB2BQuote,
  canRejectB2BQuote,
} from '../constants/b2bQuoteStatus';
import {
  formatMinorCurrency,
  getQuoteCommissionAmountMinor,
  getQuoteCommissionLabel,
  getQuoteNegotiatedSubtotalMinor,
  getQuoteOriginalTotalMinor,
  getQuotePaymentStatusLabel,
  getQuoteTotalMinor,
  normalizeQuote,
  toNumber,
} from '../utils/b2bQuoteNormalize';

const fmtDate = (iso) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const fmtDateTime = (iso) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

function paymentStateLabel(state) {
  switch (state) {
    case 'awaiting_remittance':
      return 'Awaiting remittance';
    case 'paid':
      return 'Paid';
    case 'processing':
      return 'Processing';
    case 'failed':
      return 'Failed';
    case 'canceled':
      return 'Canceled';
    case 'payment_required':
      return 'Payment required';
    default:
      return 'Not required';
  }
}

export default function B2BQuoteDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [quote, setQuote] = useState(null);
  const [instructions, setInstructions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [shippingAddress, setShippingAddress] = useState({
    first_name: '',
    last_name: '',
    address_1: '',
    city: '',
    province: '',
    postal_code: '',
    country_code: 'ca',
    phone: '',
  });

  const loadQuote = useCallback(async (signal, { background = false } = {}) => {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
      setError(null);
    }
    try {
      const detail = await b2bApi.getQuote(id, { signal });
      if (signal?.aborted) return;

      const normalized = normalizeQuote(detail.quote || detail);
      setQuote(normalized);

      if (normalized.status === 'accepted' && ['awaiting_remittance', 'paid'].includes(normalized.payment_state)) {
        const payment = await b2bApi.getQuotePaymentInstructions(id, { signal });
        if (!signal?.aborted) setInstructions(payment);
      } else {
        setInstructions(null);
      }
    } catch (err) {
      if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
      if (!background) {
        const msg = err?.response?.data?.message || err?.message || 'Failed to load quote';
        setError(msg);
        setQuote(null);
        setInstructions(null);
      }
    } finally {
      if (!signal?.aborted) {
        if (background) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    }
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();
    loadQuote(controller.signal);
    return () => controller.abort();
  }, [loadQuote]);

  useEffect(() => {
    if (!quote || ![B2B_QUOTE_STATUS.PENDING_MERCHANT, B2B_QUOTE_STATUS.PENDING_CUSTOMER].includes(quote.status)) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      const controller = new AbortController();
      loadQuote(controller.signal, { background: true });
    }, 5000);

    return () => window.clearInterval(timer);
  }, [loadQuote, quote?.status]);

  useEffect(() => {
    if (!quote || quote.status !== 'pending_customer') return undefined;

    let active = true;
    authService.listAddresses()
      .then((res) => {
        if (!active) return;
        const list = res?.addresses || [];
        setAddresses(list);
        const preferred = list.find((address) => address.is_default_shipping) || list[0];
        if (preferred?.id) setSelectedAddressId(preferred.id);
      })
      .catch(() => {
        if (active) setAddresses([]);
      });

    return () => {
      active = false;
    };
  }, [quote?.status]);

  const totals = useMemo(() => {
    if (!quote) return { original: 0, negotiated: 0, commission: 0, payable: 0, savings: 0 };
    const original = getQuoteOriginalTotalMinor(quote);
    const negotiated = getQuoteNegotiatedSubtotalMinor(quote);
    const commission = getQuoteCommissionAmountMinor(quote);
    const payable = getQuoteTotalMinor(quote);
    return {
      original,
      negotiated,
      commission,
      payable,
      savings: Math.max(0, original - negotiated),
    };
  }, [quote]);

  const requiresShipping = useMemo(() => {
    return Boolean(quote?.items?.some((item) => {
      if (item?.requires_shipping === false || item?.metadata?.requires_shipping === false) return false;
      return Boolean(item?.variant_id || item?.product_id);
    }));
  }, [quote]);

  const hasManualAddress = Boolean(
    shippingAddress.address_1 &&
    shippingAddress.city &&
    shippingAddress.postal_code &&
    shippingAddress.country_code
  );

  const acceptQuote = async (settlementMode = 'online') => {
    if (!quote || actionLoading) return;
    setActionLoading(true);
    try {
      if (requiresShipping && !selectedAddressId && !hasManualAddress) {
        showToast('Add a shipping address before accepting this quote.', 'error');
        setActionLoading(false);
        return;
      }

      await b2bApi.acceptQuote(quote.id, {
        offer_version: quote.offer_version,
        settlement_mode: settlementMode,
        selected_payment_provider_id: settlementMode === 'offline' ? 'invoice' : undefined,
        shipping_address_id: selectedAddressId || undefined,
        shipping_address: !selectedAddressId && hasManualAddress ? shippingAddress : undefined,
      });
      showToast('Quote accepted. Order created.', 'success');
      if (settlementMode === 'online') {
        navigate(`/b2b/quotes/${quote.id}/checkout`);
      } else {
        const controller = new AbortController();
        await loadQuote(controller.signal);
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Unable to accept quote';
      showToast(msg, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const rejectQuote = async () => {
    if (!quote || actionLoading || !canRejectB2BQuote(quote)) return;
    setActionLoading(true);
    try {
      await b2bApi.rejectQuote(quote.id, { reason: 'Rejected by customer' });
      showToast('Quote rejected.', 'success');
      const controller = new AbortController();
      await loadQuote(controller.signal);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Unable to reject quote';
      showToast(msg, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      <main className="pt-32 pb-20 container-custom">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/b2b/quotes')}
            className="p-2 rounded-full hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <div className="flex-1">
            <h1 className="text-3xl sm:text-4xl font-black text-text-primary">Quote Details</h1>
            <p className="text-sm text-text-secondary font-medium">{id}</p>
          </div>
          <button
            onClick={() => {
              const controller = new AbortController();
              loadQuote(controller.signal, { background: Boolean(quote) });
            }}
            className="p-2 rounded-full hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors text-text-secondary"
            title="Refresh"
          >
            <RefreshCw size={18} className={(loading || refreshing) ? 'animate-spin' : ''} />
          </button>
        </div>

        {loading ? (
          <div className="h-72 rounded-3xl bg-white dark:bg-slate-800 border border-stone-100 dark:border-slate-700 animate-pulse" />
        ) : error ? (
          <div className="rounded-3xl bg-white dark:bg-slate-800 border border-red-100 dark:border-red-900/30 p-8 text-center">
            <AlertCircle size={40} className="mx-auto mb-4 text-red-500" />
            <h2 className="text-xl font-black text-text-primary mb-2">Could not load quote</h2>
            <p className="text-sm text-text-secondary mb-6">{error}</p>
            <Button onClick={() => {
              const controller = new AbortController();
              loadQuote(controller.signal);
            }}>
              Retry
            </Button>
          </div>
        ) : quote ? (
          <div className="grid lg:grid-cols-[1fr_360px] gap-6">
            <section className="space-y-6">
              <div className="rounded-3xl bg-white dark:bg-slate-800 border border-stone-100 dark:border-slate-700 p-6 shadow-premium">
                <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-text-secondary mb-2">Status</p>
                    <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 dark:bg-emerald-950/25 px-4 py-2 text-sm font-black text-emerald-700 dark:text-emerald-300">
                      {quote.status === 'accepted' ? <CheckCircle2 size={16} /> : <Clock size={16} />}
                      {getQuotePaymentStatusLabel(quote)}
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs font-black uppercase tracking-widest text-text-secondary mb-2">Payment</p>
                    <p className="text-sm font-black text-text-primary">{paymentStateLabel(quote.payment_state)}</p>
                  </div>
                </div>

                <div className="grid sm:grid-cols-4 gap-4">
                  <div className="rounded-2xl bg-stone-50 dark:bg-slate-900/40 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1">Original Total</p>
                    <p className="text-xl font-black text-text-primary">{formatMinorCurrency(totals.original, quote.currency_code)}</p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300 mb-1">Negotiated Subtotal</p>
                    <p className="text-xl font-black text-emerald-700 dark:text-emerald-300">{formatMinorCurrency(totals.negotiated, quote.currency_code)}</p>
                  </div>
                  <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/20 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300 mb-1">{getQuoteCommissionLabel(quote)}</p>
                    <p className="text-xl font-black text-amber-700 dark:text-amber-300">{formatMinorCurrency(totals.commission, quote.currency_code)}</p>
                  </div>
                  <div className="rounded-2xl bg-blue-50 dark:bg-blue-950/20 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-700 dark:text-blue-300 mb-1">Final Payable</p>
                    <p className="text-xl font-black text-blue-700 dark:text-blue-300">{formatMinorCurrency(totals.payable, quote.currency_code)}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl bg-white dark:bg-slate-800 border border-stone-100 dark:border-slate-700 p-6 shadow-premium">
                <div className="flex items-center gap-2 mb-4">
                  <Package size={18} className="text-accent-primary" />
                  <h2 className="text-lg font-black text-text-primary">Line Items</h2>
                </div>
                <div className="space-y-3">
                  {quote.items?.map((item, index) => {
                    const quantity = toNumber(item.quantity, 0);
                    const originalUnitPrice = toNumber(
                      item.original_unit_price ?? item.metadata?.original_unit_price ?? item.requested_unit_price ?? item.unit_price,
                      0
                    );
                    const unitPrice = toNumber(item.negotiated_unit_price ?? item.unit_price ?? item.requested_unit_price, 0);
                    const total = toNumber(item.line_total ?? item.total, quantity * unitPrice);
                    return (
                      <div key={item.id || index} className="flex items-center justify-between gap-4 rounded-2xl bg-stone-50 dark:bg-slate-900/40 p-4">
                        <div className="min-w-0">
                          <p className="font-bold text-text-primary truncate">{item.title || 'Quote item'}</p>
                          <p className="text-xs font-medium text-text-secondary">
                            {item.sku || item.variant_sku || (item.variant_id || item.product_id ? 'No SKU' : 'Custom item')}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-black text-text-primary">{formatMinorCurrency(total, quote.currency_code)}</p>
                          <p className="text-xs text-text-secondary">
                            x{quantity} at {formatMinorCurrency(unitPrice, quote.currency_code)}
                          </p>
                          {originalUnitPrice !== unitPrice && (
                            <p className="text-xs text-text-secondary">
                              Original {formatMinorCurrency(originalUnitPrice, quote.currency_code)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <aside className="space-y-6">
              <div className="rounded-3xl bg-white dark:bg-slate-800 border border-stone-100 dark:border-slate-700 p-6 shadow-premium">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar size={18} className="text-accent-primary" />
                  <h2 className="text-lg font-black text-text-primary">Offer</h2>
                </div>
                <dl className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="font-bold text-text-secondary">Terms</dt>
                    <dd className="font-black text-text-primary">{quote.payment_terms || '-'}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="font-bold text-text-secondary">Expires</dt>
                    <dd className="font-black text-text-primary">{fmtDate(quote.expires_at)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="font-bold text-text-secondary">Accepted</dt>
                    <dd className="font-black text-text-primary">{fmtDateTime(quote.accepted_at)}</dd>
                  </div>
                </dl>
                {quote.status === B2B_QUOTE_STATUS.PENDING_MERCHANT && (
                  <div className="mt-6 rounded-2xl bg-blue-50 p-4 text-sm font-bold text-blue-700 dark:bg-blue-950/20 dark:text-blue-300">
                    Waiting for final offer from merchant
                  </div>
                )}
              </div>

              {quote.status === 'accepted' && (
                <div className="rounded-3xl bg-white dark:bg-slate-800 border border-stone-100 dark:border-slate-700 p-6 shadow-premium">
                  <div className="flex items-center gap-2 mb-4">
                    <CreditCard size={18} className="text-accent-primary" />
                    <h2 className="text-lg font-black text-text-primary">
                      {quote.payment_state === 'awaiting_remittance' || quote.payment_state === 'paid'
                        ? 'Payment Instructions'
                        : 'Payment'}
                    </h2>
                  </div>
                  {quote.payment_state === 'payment_required' ? (
                    <div className="space-y-4">
                      <p className="text-sm font-medium leading-relaxed text-text-secondary">
                        This quote is accepted and ready for online payment.
                      </p>
                      <Button className="w-full gap-2" onClick={() => navigate(`/b2b/quotes/${quote.id}/checkout`)}>
                        <CreditCard size={16} /> Pay Quote
                      </Button>
                    </div>
                  ) : instructions ? (
                    <div className="space-y-4">
                      <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 p-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300 mb-1">Amount Due</p>
                        <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">
                          {formatMinorCurrency(instructions.amount, instructions.currency_code)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1">Reference</p>
                        <p className="font-mono text-sm font-black text-text-primary break-all">{instructions.reference}</p>
                      </div>
                      <p className="text-sm font-medium leading-relaxed text-text-secondary">{instructions.instructions}</p>
                      {quote.order_id && (
                        <Button variant="secondary" className="w-full gap-2" onClick={() => navigate('/orders')}>
                          <FileText size={16} /> View Order
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-stone-50 dark:bg-slate-900/40 p-4 text-sm font-medium text-text-secondary">
                      Loading payment instructions...
                    </div>
                  )}
                </div>
              )}
            </aside>
            <section className="lg:col-span-2">
              <QuoteChat quoteId={quote.id} quote={quote} actorType="customer" />
              {quote.status === B2B_QUOTE_STATUS.PENDING_MERCHANT && (
                <div className="mt-6 rounded-3xl border border-blue-100 bg-blue-50 p-6 text-sm font-bold text-blue-700 shadow-premium dark:border-blue-900/30 dark:bg-blue-950/20 dark:text-blue-300">
                  Waiting for final offer from merchant
                </div>
              )}
              {canAcceptB2BQuote(quote) && (
                <div className="mt-6 rounded-3xl bg-white dark:bg-slate-800 border border-stone-100 dark:border-slate-700 p-6 shadow-premium">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-text-secondary mb-1">Final Offer</p>
                      <p className="text-3xl font-black text-text-primary">
                        {formatMinorCurrency(totals.payable, quote.currency_code)}
                      </p>
                      {totals.commission > 0 && (
                        <p className="mt-1 text-xs font-bold text-text-secondary">
                          {formatMinorCurrency(totals.negotiated, quote.currency_code)} + {formatMinorCurrency(totals.commission, quote.currency_code)} {getQuoteCommissionLabel(quote).toLowerCase()}
                        </p>
                      )}
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                      <Button variant="secondary" className="gap-2" disabled={actionLoading} onClick={rejectQuote}>
                        Reject
                      </Button>
                      <Button className="gap-2" disabled={actionLoading} onClick={() => acceptQuote('online')}>
                        <Scale size={16} /> {actionLoading ? 'Accepting...' : 'Accept Final Offer'}
                      </Button>
                    </div>
                  </div>
                  {requiresShipping && (
                    <div className="mt-5 space-y-3 rounded-2xl bg-stone-50 dark:bg-slate-900/40 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-text-secondary">Shipping Address</p>
                      {addresses.length > 0 && (
                        <select
                          value={selectedAddressId}
                          onChange={(event) => setSelectedAddressId(event.target.value)}
                          className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-bold text-text-primary dark:border-slate-700 dark:bg-slate-800"
                        >
                          {addresses.map((address) => (
                            <option key={address.id} value={address.id}>
                              {[address.address_1, address.city, address.postal_code].filter(Boolean).join(', ')}
                            </option>
                          ))}
                          <option value="">Enter a new address</option>
                        </select>
                      )}
                      {(!addresses.length || !selectedAddressId) && (
                        <div className="grid gap-2">
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              value={shippingAddress.first_name}
                              onChange={(event) => setShippingAddress((current) => ({ ...current, first_name: event.target.value }))}
                              placeholder="First name"
                              className="min-w-0 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-bold dark:border-slate-700 dark:bg-slate-800"
                            />
                            <input
                              value={shippingAddress.last_name}
                              onChange={(event) => setShippingAddress((current) => ({ ...current, last_name: event.target.value }))}
                              placeholder="Last name"
                              className="min-w-0 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-bold dark:border-slate-700 dark:bg-slate-800"
                            />
                          </div>
                          <input
                            value={shippingAddress.address_1}
                            onChange={(event) => setShippingAddress((current) => ({ ...current, address_1: event.target.value }))}
                            placeholder="Address"
                            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-bold dark:border-slate-700 dark:bg-slate-800"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              value={shippingAddress.city}
                              onChange={(event) => setShippingAddress((current) => ({ ...current, city: event.target.value }))}
                              placeholder="City"
                              className="min-w-0 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-bold dark:border-slate-700 dark:bg-slate-800"
                            />
                            <input
                              value={shippingAddress.province}
                              onChange={(event) => setShippingAddress((current) => ({ ...current, province: event.target.value }))}
                              placeholder="Province"
                              className="min-w-0 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-bold dark:border-slate-700 dark:bg-slate-800"
                            />
                          </div>
                          <div className="grid grid-cols-[1fr_84px] gap-2">
                            <input
                              value={shippingAddress.postal_code}
                              onChange={(event) => setShippingAddress((current) => ({ ...current, postal_code: event.target.value }))}
                              placeholder="Postal code"
                              className="min-w-0 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-bold dark:border-slate-700 dark:bg-slate-800"
                            />
                            <input
                              value={shippingAddress.country_code}
                              onChange={(event) => setShippingAddress((current) => ({ ...current, country_code: event.target.value.toLowerCase() }))}
                              placeholder="CA"
                              className="min-w-0 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-bold uppercase dark:border-slate-700 dark:bg-slate-800"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </main>
      <Footer />
      <MobileNav />
    </div>
  );
}
