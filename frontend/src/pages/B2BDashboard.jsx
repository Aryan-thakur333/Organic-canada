import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  ShieldCheck,
  DollarSign,
  Users,
  FileText,
  Send,
  ShoppingBag,
  ShoppingCart,
  Package,
  ChevronLeft,
  ArrowRight,
  RefreshCw,
  Loader2,
  Sparkles,
  TrendingUp,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import Button from '../components/common/Button';
import B2BPriceBadge from '../components/common/B2BPriceBadge';
import { b2bApi } from '../services/b2bApi';
import { getCustomerTokenSafe, getB2BCompanyContext, setB2BCompanyContext, clearB2BCompanyContext } from '../services/medusa/tokenStorage';
import { resolveDefaultRegionId } from '../lib/medusa/regions';
import { normalizeProductList } from '../lib/medusa/normalize';
import { resolveMedusaImageUrl, PRODUCT_IMAGE_FALLBACK } from '../utils/medusaImage';
import useToast from '../hooks/useToast';
import useMedusaCart from '../hooks/useMedusaCart';
import useB2BCompany from '../hooks/useB2BCompany';
import { getB2BDisplayPrice } from '../utils/b2bPricing';
import { extractB2BProducts } from '../utils/b2bProductsResponse';

// ── Helpers ────────────────────────────────────────────────────────────────

const fmtPrice = (cents) => `$${(cents / 100).toFixed(2)}`;

function isCanceled(err) {
  if (!err) return false;
  return (
    err.name === 'AbortError' ||
    err.code === 'ERR_CANCELED' ||
    err.message === 'canceled' ||
    err.constructor?.name === 'CanceledError' ||
    String(err.message).toLowerCase().includes('canceled') ||
    String(err.message).toLowerCase().includes('aborted')
  );
}

// ── CorporateProgressLoader ────────────────────────────────────────────────

const CorporateProgressLoader = () => (
  <div className="min-h-screen bg-bg-primary">
    <Navbar />
    <main className="pt-40 pb-20 container-custom flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 size={40} className="animate-spin text-accent-primary" />
        <p className="text-text-secondary font-medium">Syncing your B2B session...</p>
      </div>
    </main>
    <Footer />
    <MobileNav />
  </div>
);

// ── FullScreenDeveloperAlert ───────────────────────────────────────────────

const FullScreenDeveloperAlert = ({ onRetry }) => (
  <div className="min-h-screen bg-bg-primary">
    <Navbar />
    <main className="pt-40 pb-20 container-custom flex items-center justify-center">
      <div className="max-w-2xl w-full mx-auto bg-white dark:bg-slate-800 rounded-[2.5rem] p-10 shadow-premium border border-red-200 dark:border-red-900/30 text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <XCircle size={40} className="text-red-500" />
        </div>
        <h2 className="text-2xl font-black text-text-primary mb-4">Medusa API Server Unreachable</h2>
        <div className="bg-stone-50 dark:bg-slate-900/50 rounded-2xl p-5 mb-6 text-left font-mono text-sm">
          <p className="text-red-500 font-bold mb-2">net::ERR_CONNECTION_REFUSED</p>
          <p className="text-text-secondary">
            The frontend application could not establish a connection to the Medusa backend server at{' '}
            <span className="font-bold text-text-primary">localhost:9000</span>.
            The server may have crashed, stopped running, or is not reachable from this browser.
          </p>
        </div>
        <p className="text-text-secondary mb-8 text-sm leading-relaxed">
          Medusa API Server Unreachable. Please run 'npm run dev' on your backend terminal to activate the sync pipeline.
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={onRetry}>
            <RefreshCw size={16} /> Retry Connection
          </Button>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            <RefreshCw size={16} /> Reload Application
          </Button>
        </div>
      </div>
    </main>
    <Footer />
    <MobileNav />
  </div>
);

// ── Component ──────────────────────────────────────────────────────────────

const B2BDashboard = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { addVariant } = useMedusaCart();

  // ── Use the centralized B2B company hook ────────────────────────────────
  const { company, isLoading: companyLoading, error: companyError, refetch: refetchCompany } = useB2BCompany();

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState(null);
  const [quantities, setQuantities] = useState({});

  // ── Rigid Sync Lifecycle Management (Enum State) ─────────────────────────
  const [syncState, setSyncState] = useState("syncing");

  // ── Resilient Async History Interceptor ──────────────────────────────────
  const routingLock = useRef(false);
  const productsFetchLock = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      routingLock.current = false;
      productsFetchLock.current = false;
    };
  }, []);

  const setProductQuantity = (productId, value) => {
    const quantity = Math.min(100, Math.max(1, Math.floor(Number(value) || 1)));
    setQuantities((prev) => ({ ...prev, [productId]: quantity }));
  };

  const handleAddToCart = async (event, product) => {
    event.stopPropagation();
    const variant = product.variants?.find((item) => item?.id) || product.variants?.[0];
    if (!variant?.id) {
      showToast('This product has no available variant', 'error');
      return;
    }

    const quantity = quantities[product.id] || 1;
    try {
      await addVariant({
        variantId: variant.id,
        quantity,
        metadata: {
          b2b: true,
          customer_type: 'b2b',
          b2b_company_id: company?.id,
          b2b_company_name: company?.company_name,
          b2b_price_list: 'B2B customer',
        },
      });
      showToast(`${quantity} x ${product.title} added to cart`, 'success');
    } catch (error) {
      showToast(error?.message || 'Failed to add to cart', 'error');
    }
  };

  // ── Session Hydration with Post-Checkout 401 Recovery ────────────────────
  useEffect(() => {
    // Set routing lock to prevent state resets during navigation
    routingLock.current = true;
    let canceled = false;

    (async () => {
      setSyncState("syncing");

      try {
        // Wait for the useB2BCompany hook to complete its initial fetch
        if (companyLoading) return;

        // Check for errors from the hook
        if (companyError) {
          console.error('[B2B Dashboard] Company hook error:', companyError);

          // ── Defend Against Checkout Request State Resets ─────────────
          // If a 401 occurs immediately following order creation, it indicates
          // a session state mutation leak. Fallback to cached company data
          // from localStorage to keep the layout active.
          if (companyError?.response?.status === 401 || companyError?.message?.includes('401')) {
            console.warn('[B2B Dashboard] Post-checkout 401 detected, attempting cache recovery');
            
            // Attempt to recover company context from sessionStorage
            const cachedContext = getB2BCompanyContext();
            if (cachedContext?.companyId) {
              console.log('[B2B Dashboard] Recovering company from cache:', cachedContext);
              
              // Set a temporary company state from cache to keep UI active
              // The hook will retry in the background with fresh credentials
              setSyncState("active");
              
              // Trigger a silent background refresh without disrupting UI
              setTimeout(() => {
                refetchCompany().catch(err => {
                  console.warn('[B2B Dashboard] Background refresh failed, user can retry manually');
                });
              }, 1000);
              
              return;
            }
            
            // If no cache available, check if we still have a valid token
            const token = getCustomerTokenSafe();
            if (!token) {
              console.warn('[B2B Dashboard] No valid token found after 401');
              setSyncState("unlinked");
              return;
            }
          }

          // For non-401 errors, set offline state
          setSyncState("offline");
          return;
        }

        // If company is null and not loading, check if it's a real "no company" case
        if (!company) {
          console.log('[B2B Dashboard] No company found');
          setSyncState("unlinked");
          return;
        }

        // Check company status
        if (company.status !== 'approved' && company.status !== 'active') {
          const statusPath = ['pending', 'rejected', 'suspended'].includes(company.status)
            ? `/b2b/${company.status}`
            : null;
          if (statusPath) {
            console.log(`[B2B Dashboard] Company status is "${company.status}", redirecting to ${statusPath}`);
            navigate(statusPath);
          } else {
            navigate('/b2b/login');
          }
          return;
        }

        // Persist company context for navigation continuity
        setB2BCompanyContext({
          companyId: company.id,
          companyName: company.company_name,
          status: company.status,
        });

        setSyncState("active");
      } catch (err) {
        if (isCanceled(err)) {
          // ── Resilient Async History Interceptor ────────────────────────
          if (routingLock.current) {
            console.log('[B2B Dashboard] Navigation canceled, preserving state');
            return;
          }
        }
        if (isCanceled(err)) return;
        console.error('[B2B Dashboard] Error in hydration', err);

        // ── Comprehensive Error Handling & Network Recovery Gates ───────
        if (!err.response || err.code === 'ERR_NETWORK' || err.code === 'BACKEND_OFFLINE' || err.code === 'ECONNREFUSED' || err.code === 'ECONNABORTED') {
          setSyncState("offline");
          return;
        }

        setSyncState("offline");
      } finally {
        routingLock.current = false;
      }
    })();

    return () => {
      canceled = true;
      routingLock.current = false;
    };
  }, [company, companyLoading, companyError, navigate, refetchCompany]);

  // ── Fetch B2B products with routing lock ──────────────────────────────────
  useEffect(() => {
    if (!company || (company.status !== 'approved' && company.status !== 'active')) return;
    if (syncState !== "active") return;

    if (productsFetchLock.current) return;
    productsFetchLock.current = true;
    mountedRef.current = true;

    const controller = new AbortController();
    let canceled = false;

    (async () => {
      setProductsLoading(true);
      setProductsError(null);
      try {
        const customerToken = getCustomerTokenSafe();
        const regionId = await resolveDefaultRegionId();

        const regionIdString = String(regionId);
        const currencyCodeString = 'cad';

        if (!customerToken || !regionIdString) {
          console.warn('[B2B Dashboard] Missing token or region, skipping products fetch', {
            customerToken: !!customerToken,
            regionId: regionIdString,
          });
          setProducts([]);
          return;
        }

        const res = await b2bApi.getB2BProducts({
          limit: 8,
          region_id: regionIdString,
          currency_code: currencyCodeString,
          signal: controller.signal,
        });

        if (canceled || controller.signal.aborted) return;

        const rawProducts =
          res && typeof res === 'object' && Array.isArray(res.products)
            ? res.products
            : extractB2BProducts(res);

        const normalized = normalizeProductList(rawProducts);
        setProducts(normalized);
      } catch (err) {
        if (isCanceled(err)) {
          // ── Resilient Async History Interceptor ────────────────────────
          if (routingLock.current || controller.signal.aborted) {
            console.log('[B2B Dashboard] Product fetch canceled during navigation, preserving catalog');
            return;
          }
        }
        if (isCanceled(err)) return;
        console.error('[B2B Dashboard] Error fetching products', err);

        if (err?.response?.status === 429) {
          setProductsError('Rate limit triggered, syncing data view cleanly.');
          setProductsLoading(false);
          showToast('Rate limit triggered, syncing data view cleanly.', 'error');
          productsFetchLock.current = false;
          return;
        }

        setProductsError(err?.message || 'Failed to load products');
        setProducts([]);
      } finally {
        setProductsLoading(false);
        productsFetchLock.current = false;
      }
    })();

    return () => {
      canceled = true;
      controller.abort();
      productsFetchLock.current = false;
    };
  }, [company?.id, syncState]);

  // ── Complete Visibility Continuity Guard ──────────────────────────────────

  // 1. Offline state — backend is unreachable
  if (syncState === "offline") {
    return <FullScreenDeveloperAlert onRetry={() => { setSyncState("syncing"); refetchCompany(); }} />;
  }

  // 2. Syncing state — async pipeline is in-flight
  if (syncState === "syncing") {
    return <CorporateProgressLoader />;
  }

  // 3. Unlinked state — backend confirmed no B2B company mapping
  if (syncState === "unlinked") {
    return (
      <div className="min-h-screen bg-bg-primary">
        <Navbar />
        <main className="pt-40 pb-20 container-custom flex items-center justify-center">
          <div className="max-w-lg w-full mx-auto bg-white dark:bg-slate-800 rounded-[2.5rem] p-8 shadow-premium text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <AlertTriangle size={32} className="text-amber-500" />
            </div>
            <h2 className="text-2xl font-black text-text-primary mb-2">No B2B Company Found</h2>
            <p className="text-text-secondary mb-6">
              Your account is not linked to any B2B company. Please register your company to access wholesale
              pricing and bulk ordering.
            </p>
            <Button onClick={() => navigate('/b2b/register-company')}>Register Your Company</Button>
          </div>
        </main>
        <Footer />
        <MobileNav />
      </div>
    );
  }

  // 4. Active state — company data resolved successfully
  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />

      <main className="pt-32 pb-20 container-custom">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 mb-10">
          <button
            onClick={() => navigate('/profile')}
            className="p-2 rounded-full hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <div className="flex-1">
            <h1 className="text-4xl font-black text-text-primary">B2B Dashboard.</h1>
            <p className="text-sm text-text-secondary">
              Welcome back, <strong className="text-text-primary">{company?.company_name || 'Loading...'}</strong> —
              your wholesale account is active.
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 text-text-secondary hover:text-text-primary transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {/* ── Wholesale Badge ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-[2.5rem] p-8 mb-10 text-white shadow-xl"
        >
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck size={20} />
                <span className="text-sm font-black uppercase tracking-widest">Wholesale Access</span>
              </div>
              <h2 className="text-3xl font-black">B2B Wholesale Pricing Active</h2>
              <p className="text-emerald-100 mt-1 text-sm">
                You can now access bulk pricing and corporate checkout.
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                className="bg-white text-emerald-700 hover:bg-emerald-50 shadow-lg"
                size="lg"
                onClick={() => navigate('/b2b/request-quote')}
              >
                <Send size={18} /> Request Quote
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="bg-emerald-700/30 text-white border-emerald-400/30 hover:bg-emerald-700/50"
                onClick={() => navigate('/account/b2b-quotes')}
              >
                <FileText size={18} /> Quote History
              </Button>
            </div>
          </div>
        </motion.div>

        {/* ── Company Info Cards ─────────────────────────────────────────── */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-6 mb-10">
          {[
            { icon: <Building2 size={22} />, label: 'Company', value: company?.company_name || '—', color: 'bg-accent-primary/10 text-accent-primary' },
            { icon: <DollarSign size={22} />, label: 'Credit Limit', value: fmtPrice(company?.approved_credit_limit || company?.credit_limit || 0), color: 'bg-emerald-500/10 text-emerald-600' },
            { icon: <Users size={22} />, label: 'Status', value: company?.status === 'approved' || company?.status === 'active' ? 'Approved' : company?.status || '—', color: 'bg-blue-500/10 text-blue-600' },
            { icon: <FileText size={22} />, label: 'Email', value: company?.email || 'Linked customer', color: 'bg-amber-500/10 text-amber-600' },
            { icon: <TrendingUp size={22} />, label: 'Tax ID', value: company?.tax_id || '—', color: 'bg-purple-500/10 text-purple-600' },
          ].map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-premium border border-stone-100 dark:border-slate-700"
            >
              <div className={`w-12 h-12 rounded-2xl ${card.color} flex items-center justify-center mb-4`}>
                {card.icon}
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-text-secondary mb-1">{card.label}</p>
              <p className="text-xl font-black text-text-primary truncate">{card.value}</p>
            </motion.div>
          ))}
        </div>

        {/* ── Quick Actions ───────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-8 shadow-premium border border-stone-100 dark:border-slate-700 mb-10"
        >
          <h2 className="text-2xl font-black text-text-primary mb-6 flex items-center gap-2">
            <Sparkles size={22} className="text-accent-primary" />
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: <ShoppingBag size={22} />, label: 'Shop Wholesale Products', desc: 'Browse with B2B pricing', onClick: () => navigate('/b2b/products') },
              { icon: <Send size={22} />, label: 'Request Quote', desc: 'Submit bulk order request', onClick: () => navigate('/b2b/request-quote') },
              { icon: <FileText size={22} />, label: 'Quote History', desc: 'View past quotes & orders', onClick: () => navigate('/account/b2b-quotes') },
              { icon: <Package size={22} />, label: 'My Orders', desc: 'Review completed orders', onClick: () => navigate('/orders') },
            ].map((action, i) => (
              <motion.button
                key={action.label}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
                onClick={action.onClick}
                className="p-5 rounded-2xl bg-stone-50 dark:bg-slate-900/50 border border-stone-100 dark:border-slate-700 hover:bg-accent-primary/5 hover:border-accent-primary/20 transition-all text-left group"
              >
                <div className="w-10 h-10 rounded-xl bg-accent-primary/10 text-accent-primary flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  {action.icon}
                </div>
                <p className="text-sm font-bold text-text-primary mb-0.5">{action.label}</p>
                <p className="text-[10px] text-text-secondary font-medium">{action.desc}</p>
              </motion.button>
            ))}
          </div>
        </motion.div>

        {/* ── B2B Products ───────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-8 shadow-premium border border-stone-100 dark:border-slate-700"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-black text-text-primary flex items-center gap-2">
              <Package size={22} className="text-accent-primary" />
              Featured Wholesale Products
            </h2>
            <Button
              variant="secondary"
              size="sm"
              className="gap-2 text-xs font-black uppercase tracking-wider"
              onClick={() => navigate('/b2b/products')}
            >
              View All <ArrowRight size={14} />
            </Button>
          </div>

          {productsLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-2xl bg-stone-50 dark:bg-slate-900/50 animate-pulse h-48" />
              ))}
            </div>
          ) : productsError ? (
            <div className="py-8 text-center">
              <AlertTriangle size={32} className="mx-auto mb-3 text-amber-400" />
              <p className="text-sm font-bold text-text-secondary">Could not load wholesale products</p>
              <p className="text-xs text-text-secondary mt-1">{productsError}</p>
            </div>
          ) : products.length === 0 ? (
            <div className="py-12 text-center">
              <Package size={40} className="mx-auto mb-3 text-stone-300 dark:text-slate-600" />
              <p className="text-sm font-bold text-text-secondary">
                No B2B products were resolved from the active B2B price list. Please check price list override
                links.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {products.slice(0, 4).map((product) => {
                const priceInfo = getB2BDisplayPrice(product.variants?.[0]);
                const selectedQty = quantities[product.id] || 1;
                return (
                  <motion.div
                    key={product.id}
                    whileHover={{ y: -4 }}
                    className="rounded-2xl bg-stone-50 dark:bg-slate-900/50 overflow-hidden border border-stone-100 dark:border-slate-700 cursor-pointer group"
                    onClick={() => navigate(`/product/${product.id}`)}
                  >
                    <div className="aspect-square overflow-hidden bg-stone-100 dark:bg-slate-800">
                      <img
                        src={resolveMedusaImageUrl(product.thumbnail)}
                        alt={product.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={(e) => {
                          e.target.src = PRODUCT_IMAGE_FALLBACK;
                        }}
                      />
                    </div>
                    <div className="p-3">
                      <p className="text-xs font-bold text-text-primary truncate mb-1">{product.title}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mb-3">
                        <span className="text-sm font-black text-accent-primary">{priceInfo.formatted}</span>
                        {priceInfo.originalAmount !== null &&
                          priceInfo.amount !== null &&
                          priceInfo.originalAmount > priceInfo.amount && (
                            <span className="text-[10px] text-text-secondary line-through">
                              {priceInfo.originalFormatted}
                            </span>
                          )}
                        <B2BPriceBadge compact />
                      </div>
                      <div className="flex flex-col gap-2 mt-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={selectedQty}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => setProductQuantity(product.id, event.target.value)}
                            className="w-12 px-1 py-2 rounded-xl bg-white dark:bg-slate-800 text-center text-xs font-black text-text-primary outline-none focus:ring-2 focus:ring-accent-primary/30"
                            aria-label={`Quantity for ${product.title}`}
                          />
                          <button
                            onClick={(event) => handleAddToCart(event, product)}
                            className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-accent-primary px-3 py-2 text-xs font-black text-white hover:bg-accent-secondary transition-colors"
                            aria-label={`Add ${product.title} to cart`}
                          >
                            <ShoppingCart size={14} /> Add
                          </button>
                        </div>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            const variant = product.variants?.[0];
                            if (!variant?.id) {
                              showToast('No purchasable variant available.', 'error');
                              return;
                            }
                            navigate('/b2b/request-quote', {
                              state: {
                                product,
                                variant,
                                quantity: selectedQty,
                              },
                            });
                          }}
                          disabled={!product.variants?.some((variant) => variant?.id)}
                          className="w-full inline-flex items-center justify-center gap-1 rounded-xl bg-stone-100 dark:bg-slate-700 hover:bg-stone-200 dark:hover:bg-slate-600 px-3 py-2 text-xs font-black text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Send size={12} />
                          {product.variants?.some((variant) => variant?.id) ? 'Request Quote' : 'No variant'}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* ── Admin note ─────────────────────────────────────────────────── */}
        {company?.admin_note && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="mt-6 p-5 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/25 rounded-[2rem]"
          >
            <p className="text-xs font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-1">
              Admin Note
            </p>
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300">{company.admin_note}</p>
          </motion.div>
        )}

      </main>

      <Footer />
      <MobileNav />
    </div>
  );
};

export default B2BDashboard;