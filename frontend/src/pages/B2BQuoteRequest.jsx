import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  Plus,
  Trash2,
  Send,
  Building2,
  Search,
  X,
  AlertCircle,
  CheckCircle2,
  FileText,
  ShoppingBag,
  Hash,
  DollarSign,
  Loader2,
  ChevronLeft,
  Scale,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import Button from '../components/common/Button';
import { b2bApi } from '../services/b2bApi';
import useToast from '../hooks/useToast';
import { resolveDefaultRegionContext } from '../lib/medusa/regions';
import { normalizeProductList } from '../lib/medusa/normalize';
import { getB2BVariantPrice } from '../utils/b2bPricing';
import { extractB2BProducts } from '../utils/b2bProductsResponse';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} QuoteLineItem
 * @property {string} id - unique client-side key for React rendering
 * @property {string|null} product_id
 * @property {string|null} variant_id
 * @property {string} title
 * @property {string|null} sku
 * @property {number} quantity
 * @property {number} unit_price - in cents
 */

/**
 * @typedef {Object} B2BCompany
 * @property {string} id
 * @property {string} company_name
 * @property {string|null} tax_id
 * @property {number} credit_limit
 * @property {'approved'|'active'|'pending'|'rejected'|'inactive'|'suspended'} status
 */

// ── Helpers ────────────────────────────────────────────────────────────────

/** Generate a stable-ish client-side ID for new line items */
let idCounter = 0;
const genItemId = () => `new_${++idCounter}_${Date.now()}`;

/** Format cents → $X.XX */
const fmtPrice = (cents) => `$${(cents / 100).toFixed(2)}`;

const emptyItem = () => ({
  id: genItemId(),
  product_id: null,
  variant_id: null,
  title: '',
  sku: null,
  quantity: 1,
  unit_price: 0,
});

const getPurchasableVariant = (product, selectedVariant = null) => {
  if (selectedVariant?.id) return selectedVariant;
  return product?.variants?.find((variant) => variant?.id) || product?.variants?.[0] || null;
};

const getQuoteUnitPrice = (variant) => (
  getB2BVariantPrice(variant) ?? variant?.prices?.[0]?.amount ?? 0
);

// ── Component ──────────────────────────────────────────────────────────────

const B2BQuoteRequest = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();

  const initialProduct = location.state?.product;
  const initialVariant = location.state?.variant;

  // ── State ─────────────────────────────────────────────────────────────
  const [company, setCompany] = useState(/** @type {B2BCompany|null} */ (null));
  const [companyLoading, setCompanyLoading] = useState(true);
  const [items, setItems] = useState(/** @type {QuoteLineItem[]} */ (() => {
    if (initialProduct) {
      const variant = getPurchasableVariant(initialProduct, initialVariant);
      const unitPrice = getQuoteUnitPrice(variant);
      return [{
        id: genItemId(),
        product_id: initialProduct.id,
        variant_id: variant?.id || null,
        title: initialProduct.title,
        sku: variant?.sku || initialProduct.sku || null,
        quantity: location.state?.quantity || 1,
        unit_price: unitPrice,
      }];
    }
    return [emptyItem()];
  }));
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(/** @type {object|null} */ (null));
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  // ── Fetch company & B2B Products catalog on mount ─────────────────────
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await b2bApi.getCompany({ signal: controller.signal });
        if (controller.signal.aborted) return;
        setCompany(res?.company ?? null);
      } catch (err) {
        if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED' || err?.message === 'canceled') return;
        setCompany(null);
      } finally {
        if (!controller.signal.aborted) setCompanyLoading(false);
      }
    })();

    (async () => {
      try {
        setCatalogLoading(true);
        const pricingContext = await resolveDefaultRegionContext();
        if (!pricingContext?.region_id || !pricingContext?.currency_code) return;
        const res = await b2bApi.getB2BProducts({
          limit: 100,
          region_id: pricingContext.region_id,
          currency_code: pricingContext.currency_code,
        });
        if (controller.signal.aborted) return;
        setCatalogProducts(normalizeProductList(extractB2BProducts(res)));
      } catch (err) {
        console.warn("Failed to load catalog products for Quick Add:", err);
      } finally {
        if (!controller.signal.aborted) setCatalogLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  // ── Derived values ────────────────────────────────────────────────────
  const subtotal = items.reduce((sum, item) => sum + (item.unit_price || 0) * (item.quantity || 0), 0);
  const itemCount = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const isValid = items.some((item) => item.title.trim() && item.unit_price > 0 && item.quantity > 0);
  const isB2BReady = company && (company.status === 'active' || company.status === 'approved');

  // ── Item management ───────────────────────────────────────────────────
  const addItem = (product) => {
    if (product) {
      const variant = getPurchasableVariant(product);
      if (!variant?.id) {
        showToast('No purchasable variant available.', 'error');
        return;
      }
      const unitPrice = getQuoteUnitPrice(variant);
      setItems((prev) => [
        ...prev.filter((it) => it.title.trim() !== ''),
        {
          id: genItemId(),
          product_id: product.id,
          variant_id: variant?.id || null,
          title: product.title,
          sku: variant?.sku || product.sku || null,
          quantity: 1,
          unit_price: unitPrice,
        },
      ]);
      setSearchOpen(false);
      setSearchQuery('');
    } else {
      setItems((prev) => [...prev, emptyItem()]);
    }
  };

  const updateItem = (id, field, value) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const removeItem = (id) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== id) : prev));
  };

  // ── Quick-add filtered products ───────────────────────────────────────
  const filteredQuick = catalogProducts.filter(
    (p) =>
      p.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.variants?.some((v) => v.sku?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // ── Submit ────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid) return;

    const filteredItems = items.filter((item) => item.title.trim() && item.quantity > 0);

    if (filteredItems.length === 0) {
      showToast('Please add at least one valid item to the quote.', 'error');
      return;
    }

    for (const [index, item] of filteredItems.entries()) {
      if (!item.product_id || !item.variant_id) {
        showToast(`Item at row ${index + 1} ("${item.title}") must be a valid catalog product with an active variant. Please use Quick Add.`, 'error');
        return;
      }
      if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) {
        showToast(`Item at row ${index + 1} must have a positive quantity.`, 'error');
        return;
      }
    }

    setSubmitting(true);
    try {
      // ── Dynamic Quote Request Pricing Context Configuration ───────────
      // Explicitly attach currency_code and region_id to the POST payload
      // to prevent "Method calculatePrices requires currency_code" crash.
      const pricingContext = await resolveDefaultRegionContext();

      if (!pricingContext?.region_id || !pricingContext?.currency_code) {
        showToast('Unable to resolve your checkout region for quote pricing. Please refresh and try again.', 'error');
        return;
      }
      
      const payload = {
        items: filteredItems.map((item) => ({
          product_id: item.product_id,
          variant_id: item.variant_id,
          quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
          note: item.title ? `Product: ${item.title}${item.sku ? ` (SKU: ${item.sku})` : ''}${item.unit_price ? ` at ${fmtPrice(item.unit_price)}/unit` : ''}` : undefined,
        })),
        buyer_note: notes.trim() || undefined,
        currency_code: pricingContext.currency_code,
        region_id: pricingContext.region_id,
      };

      const res = await b2bApi.submitQuote(payload);
      setSubmitted(res);
      showToast('Quote request submitted for admin review! ✅', 'success');
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to submit quote';
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render: Loading ───────────────────────────────────────────────────
  if (companyLoading) {
    return (
      <div className="min-h-screen bg-bg-primary">
        <Navbar />
        <main className="pt-40 pb-20 container-custom flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 size={40} className="animate-spin text-accent-primary" />
            <p className="text-text-secondary font-medium">Loading your company profile...</p>
          </div>
        </main>
        <Footer />
        <MobileNav />
      </div>
    );
  }

  // ── Render: No B2B company ────────────────────────────────────────────
  if (!company) {
    return (
      <div className="min-h-screen bg-bg-primary">
        <Navbar />
        <main className="pt-32 pb-20 container-custom">
          <div className="max-w-lg mx-auto bg-white dark:bg-slate-800 rounded-[2.5rem] p-12 shadow-premium border border-stone-100 dark:border-slate-700 text-center">
            <div className="inline-flex p-6 rounded-full bg-amber-500/10 text-amber-600 mb-6">
              <Building2 size={48} />
            </div>
            <h2 className="text-3xl font-black mb-3">B2B Account Required</h2>
            <p className="text-text-secondary mb-8 leading-relaxed">
              You need an active B2B company profile to submit wholesale quote requests.
              Register your company first to get started.
            </p>
            <Button
              size="lg"
              className="gap-2"
              onClick={() => navigate('/b2b/register-company')}
            >
              <Building2 size={18} /> Register B2B Company
            </Button>
          </div>
        </main>
        <Footer />
        <MobileNav />
      </div>
    );
  }

  // ── Render: Inactive company ──────────────────────────────────────────
  if (!isB2BReady) {
    return (
      <div className="min-h-screen bg-bg-primary">
        <Navbar />
        <main className="pt-32 pb-20 container-custom">
          <div className="max-w-lg mx-auto bg-white dark:bg-slate-800 rounded-[2.5rem] p-12 shadow-premium border border-stone-100 dark:border-slate-700 text-center">
            <div className="inline-flex p-6 rounded-full bg-red-500/10 text-red-500 mb-6">
              <AlertCircle size={48} />
            </div>
            <h2 className="text-3xl font-black mb-3">Company {company.status}</h2>
            <p className="text-text-secondary mb-8 leading-relaxed">
              Your company account is currently <strong>{company.status}</strong>.
              Only active companies can submit wholesale quote requests. Contact your
              administrator to reactivate your account.
            </p>
            <Button variant="secondary" size="lg" onClick={() => navigate('/profile')}>
              Back to Profile
            </Button>
          </div>
        </main>
        <Footer />
        <MobileNav />
      </div>
    );
  }

  // ── Render: Success screen ────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-bg-primary">
        <Navbar />
        <main className="pt-32 pb-20 container-custom">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-lg mx-auto bg-white dark:bg-slate-800 rounded-[2.5rem] p-12 shadow-premium border border-stone-100 dark:border-slate-700 text-center"
          >
            <div className="inline-flex p-6 rounded-full bg-green-500/10 text-green-500 mb-6">
              <CheckCircle2 size={48} />
            </div>
            <h2 className="text-3xl font-black mb-2">Quote Submitted! 🎉</h2>
            <p className="text-text-secondary mb-6 leading-relaxed">
              Your wholesale quote request <strong>#{submitted.quote?.id?.slice(-8).toUpperCase()}</strong>{' '}
              has been received. Our team will review it and get back to you shortly.
            </p>

            <div className="bg-stone-50 dark:bg-slate-900/50 rounded-2xl p-6 mb-8 text-left text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-text-secondary font-medium">Reference ID</span>
                <span className="font-bold text-text-primary">#{submitted.quote?.id?.slice(-8).toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary font-medium">Status</span>
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 text-[10px] font-black uppercase tracking-wider border border-blue-200 dark:border-blue-800/25">
                  {submitted.quote?.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary font-medium">Total Items</span>
                <span className="font-bold text-text-primary">{itemCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary font-medium">Est. Subtotal</span>
                <span className="font-bold text-text-primary">{fmtPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary font-medium">Company</span>
                <span className="font-bold text-text-primary">{company.company_name}</span>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Button
                size="lg"
                className="w-full gap-2"
                onClick={() => {
                  setSubmitted(null);
                  setItems([emptyItem()]);
                  setNotes('');
                }}
              >
                <Plus size={18} /> Submit Another Quote
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={() => navigate('/profile')}
              >
                Back to Dashboard
              </Button>
            </div>
          </motion.div>
        </main>
        <Footer />
        <MobileNav />
      </div>
    );
  }

  // ── Render: Main form ─────────────────────────────────────────────────
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
            <h1 className="text-4xl font-black text-text-primary">Wholesale Quote.</h1>
            <p className="text-sm text-text-secondary">
              Submit a bulk order request for your company — our team will review and negotiate pricing.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-slate-800 rounded-2xl border border-stone-100 dark:border-slate-700 shadow-sm">
            <Building2 size={18} className="text-accent-primary shrink-0" />
            <div className="text-xs">
              <p className="font-black text-text-primary">{company.company_name}</p>
              <p className="text-text-secondary font-medium">
                Credit: {fmtPrice(company.credit_limit)}
              </p>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400 text-[9px] font-black uppercase tracking-wider border border-green-200 dark:border-green-800/25">
              {company.status}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid lg:grid-cols-3 gap-8 items-start">
          {/* ── Left / Center: Line Items ───────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">
            {/* ── Item list ─────────────────────────────────────────────── */}
            <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-8 shadow-premium border border-stone-100 dark:border-slate-700">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-black text-text-primary">Line Items</h2>
                  <p className="text-xs text-text-secondary font-medium">
                    {items.length} item{items.length !== 1 ? 's' : ''} · {itemCount} unit{itemCount !== 1 ? 's' : ''} total
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="gap-1.5 text-xs font-black uppercase tracking-wider"
                    onClick={() => setSearchOpen(true)}
                  >
                    <Search size={14} /> Quick Add
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="gap-1.5 text-xs font-black uppercase tracking-wider"
                    onClick={() => addItem()}
                  >
                    <Plus size={14} /> Add Row
                  </Button>
                </div>
              </div>

              <AnimatePresence mode="popLayout">
                {items.map((item, index) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: -10, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -10, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="group relative flex flex-wrap sm:flex-nowrap items-end gap-3 p-4 mb-3 bg-stone-50 dark:bg-slate-900/40 rounded-2xl border border-stone-100 dark:border-slate-700/50 last:mb-0"
                  >
                    {/* Product title */}
                    <div className="flex-1 min-w-[180px]">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1.5">
                        Product / Item
                      </label>
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) => updateItem(item.id, 'title', e.target.value)}
                        placeholder="e.g. Organic Apple Box"
                        className="w-full px-3 py-2.5 bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 text-sm font-medium text-text-primary placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-accent-primary/30 focus:border-accent-primary transition-all"
                      />
                    </div>

                    {/* SKU */}
                    <div className="w-28">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1.5">
                        SKU
                      </label>
                      <input
                        type="text"
                        value={item.sku || ''}
                        onChange={(e) => updateItem(item.id, 'sku', e.target.value || null)}
                        placeholder="—"
                        className="w-full px-3 py-2.5 bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 text-sm font-medium text-text-primary placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-accent-primary/30 focus:border-accent-primary transition-all"
                      />
                    </div>

                    {/* Quantity */}
                    <div className="w-24">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1.5">
                        Qty
                      </label>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(item.id, 'quantity', Math.max(1, parseInt(e.target.value) || 1))
                        }
                        className="w-full px-3 py-2.5 bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 text-sm font-bold text-text-primary text-center focus:outline-none focus:ring-2 focus:ring-accent-primary/30 focus:border-accent-primary transition-all"
                      />
                    </div>

                    {/* Unit price */}
                    <div className="w-28">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1.5">
                        Price (¢)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm font-medium">$</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={item.unit_price}
                          onChange={(e) =>
                            updateItem(item.id, 'unit_price', Math.max(0, parseInt(e.target.value) || 0))
                          }
                          className="w-full pl-7 pr-3 py-2.5 bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 text-sm font-bold text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30 focus:border-accent-primary transition-all"
                        />
                      </div>
                    </div>

                    {/* Line total */}
                    <div className="w-24 text-right">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1.5">
                        Total
                      </label>
                      <p className="py-2.5 text-sm font-black text-text-primary">
                        {fmtPrice((item.unit_price || 0) * (item.quantity || 0))}
                      </p>
                    </div>

                    {/* Remove */}
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="absolute top-2 right-2 sm:static sm:mb-1.5 p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                      title="Remove item"
                    >
                      <Trash2 size={16} />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* ── Quick-add product search panel ──────────────────────── */}
              <AnimatePresence>
                {searchOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-4 overflow-hidden"
                  >
                    <div className="p-4 bg-stone-50 dark:bg-slate-900/40 rounded-2xl border border-stone-100 dark:border-slate-700/50">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="relative flex-1">
                          <Search
                            size={16}
                            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
                          />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search products..."
                            autoFocus
                            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 text-sm font-medium text-text-primary placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-accent-primary/30 focus:border-accent-primary transition-all"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSearchOpen(false);
                            setSearchQuery('');
                          }}
                          className="p-2 rounded-xl hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <X size={18} className="text-stone-400" />
                        </button>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto pr-1">
                        {filteredQuick.length === 0 ? (
                          <p className="sm:col-span-2 text-xs text-text-secondary italic p-3 text-center">
                            No matching products found.
                          </p>
                        ) : (
                          filteredQuick.map((product) => {
                            const variant = getPurchasableVariant(product);
                            const unitPrice = getQuoteUnitPrice(variant);
                            return (
                              <button
                                type="button"
                                key={product.id}
                                onClick={() => addItem(product)}
                                disabled={!variant?.id}
                                className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-slate-800 border border-stone-100 dark:border-slate-700 hover:border-accent-primary/30 hover:bg-accent-primary/5 text-left transition-all group"
                              >
                                <div className="w-8 h-8 rounded-lg bg-accent-primary/10 text-accent-primary flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                                  <Package size={16} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-text-primary truncate">
                                    {product.title}
                                  </p>
                                  <p className="text-[10px] text-text-secondary font-medium">
                                    {fmtPrice(unitPrice)} · {variant?.sku || 'No SKU'}
                                  </p>
                                </div>
                                <Plus size={14} className="text-stone-300 group-hover:text-accent-primary shrink-0 transition-colors" />
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Notes ─────────────────────────────────────────────────── */}
            <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-8 shadow-premium border border-stone-100 dark:border-slate-700">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-accent-primary/10 text-accent-primary flex items-center justify-center shrink-0">
                  <FileText size={18} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-text-primary">Notes for Reviewer</h3>
                  <p className="text-xs text-text-secondary font-medium">
                    Provide context, delivery preferences, or special requests.
                  </p>
                </div>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. We need these for our weekly farm-to-table event on July 15. Prefer delivery on Wednesdays before 10 AM."
                rows={3}
                className="w-full px-4 py-3 bg-stone-50 dark:bg-slate-900/40 rounded-2xl border border-stone-100 dark:border-slate-700/50 text-sm font-medium text-text-primary placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-accent-primary/30 focus:border-accent-primary transition-all resize-none"
              />
            </div>
          </div>

          {/* ── Right Sidebar: Summary & Submit ─────────────────────────── */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-8 shadow-premium border border-stone-100 dark:border-slate-700 sticky top-36">
              <h3 className="text-xl font-black text-text-primary mb-6 flex items-center gap-2">
                <Scale size={20} className="text-accent-primary" />
                Quote Summary
              </h3>

              {/* Company info */}
              <div className="flex items-center gap-3 p-4 bg-stone-50 dark:bg-slate-900/50 rounded-2xl mb-6 text-xs">
                <div className="w-10 h-10 rounded-xl bg-accent-primary/10 text-accent-primary flex items-center justify-center shrink-0">
                  <Building2 size={18} />
                </div>
                <div>
                  <p className="font-bold text-text-primary">{company.company_name}</p>
                  <p className="text-text-secondary font-medium">
                    {company.tax_id ? `Tax ID: ${company.tax_id}` : 'No tax ID'}
                  </p>
                </div>
              </div>

              {/* Totals breakdown */}
              <div className="space-y-3 mb-8">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-secondary font-medium">Item Count</span>
                  <span className="font-bold text-text-primary flex items-center gap-1.5">
                    <Package size={14} className="text-stone-400" /> {items.length} rows
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-secondary font-medium">Total Units</span>
                  <span className="font-bold text-text-primary flex items-center gap-1.5">
                    <Hash size={14} className="text-stone-400" /> {itemCount}
                  </span>
                </div>
                <div className="h-px bg-stone-100 dark:bg-slate-700" />
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary font-black uppercase text-xs tracking-wider">
                    Est. Subtotal
                  </span>
                  <span className="text-2xl font-black text-text-primary">{fmtPrice(subtotal)}</span>
                </div>
                <p className="text-[10px] text-text-secondary font-medium italic">
                  Final pricing is subject to admin negotiation approval.
                </p>
              </div>

              {/* Submit button */}
              <Button
                type="submit"
                size="lg"
                className="w-full gap-2 text-sm font-black uppercase tracking-wider"
                disabled={!isValid || submitting}
                isLoading={submitting}
              >
                <Send size={16} />
                {submitting ? 'Submitting...' : 'Submit Quote Request'}
              </Button>

              {!isValid && (
                <p className="mt-3 text-[11px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1.5">
                  <AlertCircle size={13} />
                  Add at least one item with a title, quantity, and price.
                </p>
              )}
            </div>
          </div>
        </form>
      </main>

      <Footer />
      <MobileNav />
    </div>
  );
};

export default B2BQuoteRequest;
