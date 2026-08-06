import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, FileText, Loader2, Package, RefreshCw } from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import Button from '../components/common/Button';
import PaymentMethodSelector from '../components/b2b/PaymentMethodSelector';
import StripePaymentElement from '../components/b2b/StripePaymentElement';
import PayPalButtonsWrapper from '../components/b2b/PayPalButtonsWrapper';
import { b2bApi } from '../services/b2bApi';
import useToast from '../hooks/useToast';
import {
  formatMinorCurrency,
  getQuoteCommissionAmountMinor,
  getQuoteCommissionLabel,
  getQuoteNegotiatedSubtotalMinor,
  getQuoteTotalMinor,
  toNumber,
} from '../utils/b2bQuoteNormalize';

export default function B2BQuotePayment() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState(null);
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('stripe');
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [error, setError] = useState('');

  const enabledProviders = useMemo(() => providers.filter((provider) => provider.enabled), [providers]);

  const load = async (signal) => {
    setLoading(true);
    setError('');
    try {
      const [quoteRes, paymentRes] = await Promise.all([
        b2bApi.getQuote(id, { signal }),
        b2bApi.getQuotePaymentOptions(id, { signal }),
      ]);

      if (signal?.aborted) return;
      const nextQuote = {
        ...(quoteRes.quote || {}),
        ...(paymentRes.quote || {}),
      };
      setQuote(nextQuote);
      setProviders(paymentRes.providers || []);
      const preferred = (paymentRes.providers || []).find((provider) => provider.enabled)?.id || 'invoice';
      setSelectedProvider((current) => (paymentRes.providers || []).some((provider) => provider.id === current && provider.enabled) ? current : preferred);
    } catch (err) {
      if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
      setError(err?.response?.data?.message || err?.message || 'Could not load quote payment.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [id]);

  const handlePaid = async () => {
    showToast('Payment status updated.', 'success');
    const controller = new AbortController();
    await load(controller.signal);
  };

  const requestInvoice = async () => {
    setInvoiceLoading(true);
    try {
      await b2bApi.requestQuoteInvoicePayment(id);
      showToast('Invoice payment instructions requested.', 'success');
      const controller = new AbortController();
      await load(controller.signal);
      navigate(`/b2b/quotes/${id}`);
    } catch (err) {
      showToast(err?.response?.data?.message || err?.message || 'Could not request invoice payment.', 'error');
    } finally {
      setInvoiceLoading(false);
    }
  };

  const amount = quote ? getQuoteTotalMinor(quote) : 0;
  const negotiatedSubtotal = quote ? getQuoteNegotiatedSubtotalMinor(quote) : amount;
  const commissionAmount = quote ? getQuoteCommissionAmountMinor(quote) : 0;
  const originalAmount = quote?.original_total ?? quote?.requested_total ?? negotiatedSubtotal;
  const savings = Math.max(0, toNumber(originalAmount, negotiatedSubtotal) - toNumber(negotiatedSubtotal, 0));
  const currencyCode = quote?.currency_code || 'cad';
  const isPaid = quote?.payment_state === 'paid';
  const items = Array.isArray(quote?.items)
    ? quote.items
    : Array.isArray(quote?.negotiated_items)
      ? quote.negotiated_items
      : Array.isArray(quote?.requested_items)
        ? quote.requested_items
        : [];

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      <main className="container-custom pt-32 pb-20">
        <button
          onClick={() => navigate(`/b2b/quotes/${id}`)}
          className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft size={16} /> Back to quote
        </button>

        {loading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-8 text-text-secondary dark:border-slate-700 dark:bg-slate-900">
            <Loader2 className="animate-spin" size={20} />
            <span className="text-sm font-bold">Loading quote payment...</span>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-red-700">
            <p className="font-black">Payment page unavailable</p>
            <p className="mt-1 text-sm font-semibold">{error}</p>
            <Button className="mt-5 gap-2" onClick={() => load(new AbortController().signal)}>
              <RefreshCw size={16} /> Retry
            </Button>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
            <section className="space-y-6">
              <div>
                <h1 className="text-4xl font-black text-text-primary">Quote Checkout</h1>
                <p className="mt-2 text-sm font-semibold text-text-secondary">
                  {[quote?.company_name, `Quote #${String(id || '').slice(-8).toUpperCase()}`].filter(Boolean).join(' | ')}
                </p>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
                <div className="mb-4 flex items-center gap-2">
                  <Package size={18} className="text-accent-primary" />
                  <h2 className="text-lg font-black text-text-primary">Negotiated Items</h2>
                </div>
                <div className="space-y-3">
                  {items.map((item, index) => {
                    const quantity = toNumber(item.quantity, 0);
                    const originalUnitPrice = toNumber(
                      item.original_unit_price ?? item.requested_unit_price ?? item.metadata?.original_unit_price ?? item.unit_price,
                      0
                    );
                    const negotiatedUnitPrice = toNumber(
                      item.negotiated_unit_price ?? item.unit_price ?? item.requested_unit_price,
                      0
                    );
                    const lineTotal = toNumber(
                      item.negotiated_line_total ?? item.line_total ?? item.total,
                      quantity * negotiatedUnitPrice
                    );

                    return (
                      <div key={item.id || index} className="grid gap-3 rounded-xl bg-stone-50 p-4 dark:bg-slate-800/60 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <div className="min-w-0">
                          <p className="font-black text-text-primary">{item.title || 'Quote item'}</p>
                          <p className="mt-1 text-xs font-semibold text-text-secondary">
                            {item.sku || item.variant_sku || (item.variant_id || item.product_id ? 'No SKU' : 'Custom item')}
                          </p>
                          <p className="mt-2 text-xs font-semibold text-text-secondary">
                            Qty {quantity} | Original {formatMinorCurrency(originalUnitPrice, currencyCode)} | Negotiated {formatMinorCurrency(negotiatedUnitPrice, currencyCode)}
                          </p>
                        </div>
                        <p className="text-right text-lg font-black text-text-primary">
                          {formatMinorCurrency(lineTotal, currencyCode)}
                        </p>
                      </div>
                    );
                  })}
                  {items.length === 0 && (
                    <div className="rounded-xl bg-stone-50 p-4 text-sm font-semibold text-text-secondary dark:bg-slate-800/60">
                      No line items were returned for this quote.
                    </div>
                  )}
                </div>
              </div>

              {isPaid ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-800">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 size={24} />
                    <div>
                      <p className="font-black">This quote is paid.</p>
                      <p className="text-sm font-semibold">Your payment status has been recorded.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <PaymentMethodSelector providers={providers} selected={selectedProvider} onSelect={setSelectedProvider} />
                  {enabledProviders.length === 0 && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
                      No online payment providers are configured. Use invoice payment or contact support.
                    </div>
                  )}

                  {selectedProvider === 'stripe' && (
                    <StripePaymentElement
                      quoteId={id}
                      amountMinor={amount}
                      currencyCode={currencyCode}
                      onPaid={handlePaid}
                    />
                  )}

                  {selectedProvider === 'paypal' && (
                    <PayPalButtonsWrapper quoteId={id} currencyCode={currencyCode} onPaid={handlePaid} />
                  )}

                  {selectedProvider === 'invoice' && (
                    <div className="rounded-2xl border border-stone-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
                      <div className="flex items-start gap-3">
                        <FileText size={22} className="mt-1 text-accent-primary" />
                        <div>
                          <p className="font-black text-text-primary">Invoice / bank transfer</p>
                          <p className="mt-1 text-sm font-semibold text-text-secondary">
                            This records the quote as awaiting remittance. It does not mark the quote paid automatically.
                          </p>
                        </div>
                      </div>
                      <Button className="mt-5" isLoading={invoiceLoading} disabled={invoiceLoading} onClick={requestInvoice}>
                        Request Invoice Instructions
                      </Button>
                    </div>
                  )}
                </>
              )}
            </section>

            <aside className="h-fit rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs font-black uppercase tracking-widest text-text-secondary">Amount due</p>
              <p className="mt-2 text-4xl font-black text-text-primary">
                {formatMinorCurrency(amount, currencyCode)}
              </p>
              <div className="mt-5 space-y-3 text-sm font-semibold">
                <div className="flex justify-between gap-4">
                  <span className="text-text-secondary">Original total</span>
                  <span>{formatMinorCurrency(originalAmount, currencyCode)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-text-secondary">Negotiated subtotal</span>
                  <span>{formatMinorCurrency(negotiatedSubtotal, currencyCode)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-text-secondary">{getQuoteCommissionLabel(quote)}</span>
                  <span>{formatMinorCurrency(commissionAmount, currencyCode)}</span>
                </div>
                <div className="flex justify-between gap-4 border-t border-stone-200 pt-3 dark:border-slate-700">
                  <span className="text-text-secondary">Final payable</span>
                  <span>{formatMinorCurrency(amount, currencyCode)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-text-secondary">Savings</span>
                  <span>{formatMinorCurrency(savings, currencyCode)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-text-secondary">Payment state</span>
                  <span className="capitalize">{String(quote?.payment_state || 'payment_required').replaceAll('_', ' ')}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-text-secondary">Offer version</span>
                  <span>v{quote?.offer_version || 1}</span>
                </div>
              </div>
            </aside>
          </div>
        )}
      </main>
      <Footer />
      <MobileNav />
    </div>
  );
}
