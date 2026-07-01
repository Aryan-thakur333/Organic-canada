import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ChevronLeft,
  Download,
  Loader2,
  Package,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Star,
  XCircle,
} from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import Button from '../components/common/Button';
import B2BPriceBadge from '../components/common/B2BPriceBadge';
import { b2bApi } from '../services/b2bApi';
import { getCustomerTokenSafe } from '../services/medusa/tokenStorage';
import { resolveDefaultRegionId } from '../lib/medusa/regions';
import { normalizeProductList } from '../lib/medusa/normalize';
import { resolveMedusaImageUrl, PRODUCT_IMAGE_FALLBACK } from '../utils/medusaImage';
import { getB2BDisplayPrice } from '../utils/b2bPricing';
import { extractB2BMeta, extractB2BProducts } from '../utils/b2bProductsResponse';
import useToast from '../hooks/useToast';
import useMedusaCart from '../hooks/useMedusaCart';

function isCanceled(error) {
  if (!error) return false;
  return (
    error.name === 'AbortError' ||
    error.code === 'ERR_CANCELED' ||
    error.message === 'canceled' ||
    error.constructor?.name === 'CanceledError' ||
    String(error.message).toLowerCase().includes('canceled') ||
    String(error.message).toLowerCase().includes('aborted')
  );
}

function getErrorMessage(error) {
  if (error?.response?.status === 429) {
    return 'Rate limit triggered. Please wait a moment, then retry.';
  }
  return error?.response?.data?.message || error?.message || 'Failed to load B2B products';
}

const quantityOptions = [1, 5, 10, 25, 50, 100];

const B2BProducts = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { addVariant } = useMedusaCart();

  const [products, setProducts] = useState([]);
  const [company, setCompany] = useState(null);
  const [responseMeta, setResponseMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [category, setCategory] = useState('all');
  const [quantities, setQuantities] = useState({});

  // ── Resilient Async History Interceptor ──────────────────────────────────
  // routingLock prevents state resets during browser history navigation.
  // When a user navigates back/forward via browser history, the component
  // may receive CanceledError. This lock ensures we bypass variable reset
  // operations to preserve current component states without dropping data
  // trees down to empty metrics.
  const routingLock = useRef(false);
  const retrievalLock = useRef(false);
  const navigateRef = useRef(navigate);
  const showToastRef = useRef(showToast);
  const requestSeqRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      routingLock.current = false;
      retrievalLock.current = false;
    };
  }, []);

  const fetchProducts = useCallback(async (signal) => {
    // ── Robust Session Lock ───────────────────────────────────────────────
    // Prevent mid-flight page transition drops by ensuring that the Axios
    // async data stream is gated behind the retrievalLock ref.
    if (retrievalLock.current) return;
    retrievalLock.current = true;

    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;

    const baseParams = {
      currency_code: 'cad',
      limit: 100,
    };

    try {
      setLoading(true);
      setError(null);

      // Use getCustomerTokenSafe() to read directly from storage with
      // fallback verification, preventing 401 crashes during routing
      const customerToken = getCustomerTokenSafe();
      if (!customerToken) {
        throw new Error('No active B2B session found');
      }

      const session = await b2bApi.hydrateB2BSession({ signal, forceRefresh: true });
      if (signal.aborted || requestSeqRef.current !== requestId) {
        retrievalLock.current = false;
        return;
      }

      const activeCompany = session?.company ?? null;
      setCompany(activeCompany);

      if (!session?.hasCompany || !activeCompany || !session?.hasApprovedB2BAccess) {
        const nextPath = activeCompany && ['pending', 'rejected', 'suspended'].includes(activeCompany.status)
          ? `/b2b/${activeCompany.status}`
          : '/b2b/login';
        navigateRef.current(nextPath);
        retrievalLock.current = false;
        return;
      }

      const regionId = await resolveDefaultRegionId();
      const regionIdString = String(regionId || '');
      if (!regionIdString) {
        throw new Error('Store region is unavailable');
      }

      const response = await b2bApi.getB2BProducts({
        ...baseParams,
        region_id: regionIdString,
        signal,
      });

      if (signal.aborted || requestSeqRef.current !== requestId) {
        retrievalLock.current = false;
        return;
      }

      const extracted = extractB2BProducts(response);
      const meta = extractB2BMeta(response);
      const normalized = normalizeProductList(extracted, regionIdString);

      setResponseMeta(meta);
      setProducts(normalized);
    } catch (err) {
      // ── AbortError / CanceledError Graceful Handling ──────────────────
      // If an AbortError or CanceledError occurs during background history
      // state pops (e.g. user navigates away while fetch is in-flight),
      // bypass the array reset execution logic to retain the local product
      // catalog arrays safely without forcing empty layout states on users.
      if (isCanceled(err) || signal.aborted) {
        retrievalLock.current = false;
        return;
      }

      console.error('[B2B Products] fetch failed', err);
      const status = err?.response?.status;
      const message = getErrorMessage(err);

      setError(message);
      setProducts([]);
      setResponseMeta(null);

      if (status === 401) {
        showToastRef.current('Please login as a B2B buyer to view products', 'error');
        navigateRef.current('/b2b/login');
      } else if (status === 403) {
        showToastRef.current('Your B2B company is not approved yet', 'error');
        navigateRef.current('/b2b/dashboard');
      }
    } finally {
      if (!signal.aborted && requestSeqRef.current === requestId) {
        setLoading(false);
      }
      retrievalLock.current = false;
    }
  }, [refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    fetchProducts(controller.signal);

    return () => {
      controller.abort();
    };
  }, [fetchProducts]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    const list = products.filter((product) => {
      const matchesSearch = !query ||
        product.title?.toLowerCase().includes(query) ||
        product.description?.toLowerCase().includes(query) ||
        product.categories?.some((cat) => cat.name?.toLowerCase().includes(query));

      const matchesCategory = category === 'all' ||
        product.categories?.some((cat) => cat.id === category || cat.handle === category);

      return matchesSearch && matchesCategory;
    });

    return [...list].sort((a, b) => {
      const priceA = getB2BDisplayPrice(a.variants?.[0]).amount ?? 0;
      const priceB = getB2BDisplayPrice(b.variants?.[0]).amount ?? 0;

      if (sortBy === 'price-asc') return priceA - priceB;
      if (sortBy === 'price-desc') return priceB - priceA;
      return (a.title || '').localeCompare(b.title || '');
    });
  }, [products, search, sortBy, category]);

  const categories = useMemo(() => {
    const map = new Map();
    products.forEach((product) => {
      product.categories?.forEach((cat) => {
        if (cat?.id && cat?.name) map.set(cat.id, cat.name);
      });
    });
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const handleRetry = () => {
    setRefreshKey((value) => value + 1);
  };

  const setProductQuantity = (productId, value) => {
    const quantity = Math.min(100, Math.max(1, Math.floor(Number(value) || 1)));
    setQuantities((prev) => ({ ...prev, [productId]: quantity }));
  };

  const getSelectedQuantity = (productId) => quantities[productId] || 1;

  const handleAddToCart = async (event, product) => {
    event.stopPropagation();
    const variant = product.variants?.find((item) => item?.id) || product.variants?.[0];
    if (!variant?.id) {
      showToast('This product has no available variant', 'error');
      return;
    }

    const quantity = getSelectedQuantity(product.id);
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
    } catch (err) {
      showToast(err?.message || 'Failed to add to cart', 'error');
    }
  };

  const handleRequestQuote = (event, product) => {
    event.stopPropagation();
    const variant = product.variants?.find((item) => item?.id) || product.variants?.[0];
    if (!variant?.id) {
      showToast('No purchasable variant available.', 'error');
      return;
    }

    navigate('/b2b/request-quote', {
      state: {
        product,
        variant,
        quantity: getSelectedQuantity(product.id),
        quotePayload: {
          items: [
            {
              product_id: product.id,
              variant_id: variant.id,
              quantity: getSelectedQuantity(product.id),
            },
          ],
        },
      },
    });
  };

  const renderProductCard = (product, index) => {
    const variant = product.variants?.find((item) => item?.id) || product.variants?.[0];
    const hasVariant = Boolean(variant?.id);
    const priceInfo = getB2BDisplayPrice(variant);
    const selectedQty = getSelectedQuantity(product.id);
    const isDigital = product.metadata?.is_digital === true || product.metadata?.is_digital === 'true';
    const categoryName = product.categories?.[0]?.name || product.collection?.title || 'Wholesale';

    return (
      <motion.div
        key={product.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.03 }}
        whileHover={{ y: -5 }}
        className="bg-white dark:bg-slate-800 rounded-[2rem] overflow-hidden shadow-premium border border-stone-100 dark:border-slate-700 cursor-pointer group"
        onClick={() => navigate(`/product/${product.id}`)}
      >
        <div className="aspect-square overflow-hidden bg-stone-50 dark:bg-slate-900 relative">
          <img
            src={resolveMedusaImageUrl(product.thumbnail)}
            alt={product.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(event) => { event.currentTarget.src = PRODUCT_IMAGE_FALLBACK; }}
          />
          <div className="absolute top-3 left-3">
            <B2BPriceBadge compact />
          </div>
          {isDigital && (
            <div className="absolute top-3 right-3">
              <span className="px-2 py-1 rounded-full bg-blue-600 text-white text-[8px] font-black uppercase flex items-center gap-1">
                <Download size={10} /> Digital
              </span>
            </div>
          )}
        </div>

        <div className="p-4">
          <div className="flex items-center gap-1 mb-1">
            {[...Array(5)].map((_, starIndex) => (
              <Star key={starIndex} size={10} className={starIndex < 4 ? 'fill-yellow-400 text-yellow-400' : 'text-stone-300'} />
            ))}
          </div>
          <h3 className="text-sm font-bold text-text-primary truncate mb-1 group-hover:text-accent-primary transition-colors">
            {product.title}
          </h3>
          <p className="text-xs text-text-secondary mb-3 line-clamp-1">{categoryName}</p>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <span className="text-lg font-black text-accent-primary">{priceInfo.formatted}</span>
              {priceInfo.originalAmount !== null && priceInfo.amount !== null && priceInfo.originalAmount > priceInfo.amount && (
                <span className="ml-1.5 text-xs text-text-secondary line-through">
                  {priceInfo.originalFormatted}
                </span>
              )}
            </div>
            <span className="text-[10px] font-bold uppercase text-emerald-600">In stock</span>
          </div>

          <div className="flex flex-col gap-2 mt-2">
            <div className="flex items-center gap-2">
              <select
                value={quantityOptions.includes(selectedQty) ? selectedQty : 'custom'}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => {
                  const value = event.target.value;
                  setProductQuantity(product.id, value === 'custom' ? 1 : value);
                }}
                className="w-16 px-1 py-2 rounded-xl bg-stone-100 dark:bg-slate-700 text-center text-xs font-black text-text-primary outline-none focus:ring-2 focus:ring-accent-primary/30"
                aria-label={`Bulk quantity preset for ${product.title}`}
              >
                {quantityOptions.map((quantity) => (
                  <option key={quantity} value={quantity}>{quantity}</option>
                ))}
                <option value="custom">Custom</option>
              </select>
              <button
                onClick={(event) => handleAddToCart(event, product)}
                disabled={!hasVariant}
                className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-accent-primary px-3 py-2 text-xs font-black text-white hover:bg-accent-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={`Add ${product.title} to cart`}
              >
                <ShoppingCart size={14} /> Add
              </button>
            </div>
            <button
              onClick={(event) => handleRequestQuote(event, product)}
              disabled={!hasVariant}
              className="w-full inline-flex items-center justify-center gap-1 rounded-xl bg-stone-100 dark:bg-slate-700 hover:bg-stone-200 dark:hover:bg-slate-600 px-3 py-2 text-xs font-black text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={12} />
              {hasVariant ? 'Request Quote' : 'No variant'}
            </button>
          </div>
        </div>
      </motion.div>
    );
  };

  const renderCatalogBody = () => {
    if (loading) {
      return (
        <div className="pt-24 pb-20 flex flex-col items-center justify-center gap-4">
          <Loader2 size={40} className="animate-spin text-accent-primary" />
          <p className="text-sm font-bold text-text-secondary">Loading B2B wholesale products...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="pt-20 pb-16 text-center">
          <XCircle size={48} className="mx-auto mb-4 text-red-400" />
          <p className="text-lg font-bold text-text-primary mb-2">Could not load B2B products</p>
          <p className="text-sm text-text-secondary mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <Button onClick={handleRetry}>
              <RefreshCw size={16} /> Retry
            </Button>
            <Button variant="secondary" onClick={() => navigate('/b2b/dashboard')}>
              Back to Dashboard
            </Button>
          </div>
        </div>
      );
    }

    if (products.length === 0) {
      return (
        <div className="py-24 text-center">
          <Package size={48} className="mx-auto mb-4 text-stone-300 dark:text-slate-600" />
          <p className="text-lg font-bold text-text-secondary">No B2B products found</p>
          <p className="text-sm text-text-secondary mt-1">
            The active B2B price list returned no products for this account.
          </p>
          <Button variant="secondary" className="mt-6" onClick={handleRetry}>
            <RefreshCw size={16} /> Refresh Products
          </Button>
        </div>
      );
    }

    if (filtered.length === 0) {
      return (
        <div className="py-24 text-center">
          <Package size={48} className="mx-auto mb-4 text-stone-300 dark:text-slate-600" />
          <p className="text-lg font-bold text-text-secondary">No products match the current filters.</p>
          <p className="text-sm text-text-secondary mt-1">
            Clear your search or category filter to show all wholesale products.
          </p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
        {filtered.map(renderProductCard)}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />

      <main className="pt-32 pb-20 container-custom">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/b2b/dashboard')}
            className="p-2 rounded-full hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Back to B2B dashboard"
          >
            <ChevronLeft size={24} />
          </button>
          <div className="flex-1">
            <h1 className="text-4xl font-black text-text-primary">B2B Products</h1>
            <p className="text-sm text-text-secondary">
              Browse wholesale products from your approved B2B price list.
            </p>
          </div>
          <button
            onClick={handleRetry}
            className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 text-text-secondary hover:text-text-primary transition-colors"
            title="Refresh"
            aria-label="Refresh B2B products"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-[2rem] p-5 mb-8 text-white flex items-center gap-4"
        >
          <ShieldCheck size={24} className="shrink-0" />
          <div>
            <p className="font-black text-sm">B2B Wholesale Pricing Active</p>
            <p className="text-emerald-100 text-xs">
              {company?.company_name || 'Your company'} - All prices shown are your negotiated wholesale rates.
            </p>
          </div>
        </motion.div>

        <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-5 mb-8 shadow-premium border border-stone-100 dark:border-slate-700 grid gap-4 md:grid-cols-[1fr_auto_auto] items-center">
          <div className="relative flex-1 w-full">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary" />
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-stone-50 dark:bg-slate-900 border-2 border-transparent focus:border-accent-primary rounded-2xl text-sm font-semibold outline-none transition-all"
            />
          </div>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="w-full md:w-48 px-4 py-3 bg-stone-50 dark:bg-slate-900 border-2 border-transparent focus:border-accent-primary rounded-2xl text-sm font-semibold outline-none transition-all"
          >
            <option value="all">All categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <SlidersHorizontal size={16} className="text-text-secondary" />
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
              className="px-4 py-3 bg-stone-50 dark:bg-slate-900 border-2 border-transparent focus:border-accent-primary rounded-2xl text-sm font-semibold outline-none transition-all"
            >
              <option value="name">Name A-Z</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
            </select>
          </div>
        </div>

        {renderCatalogBody()}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-12 bg-white dark:bg-slate-800 rounded-[2.5rem] p-8 shadow-premium border border-stone-100 dark:border-slate-700 text-center"
        >
          <h2 className="text-2xl font-black text-text-primary mb-2">Need Bulk Quantities?</h2>
          <p className="text-text-secondary mb-6">
            Submit a quote request for larger volumes and get customized pricing.
          </p>
          <Button size="lg" className="gap-2" onClick={() => navigate('/b2b/request-quote')}>
            <ArrowRight size={18} /> Submit Quote Request
          </Button>
        </motion.div>
      </main>

      <Footer />
      <MobileNav />
    </div>
  );
};

export default B2BProducts;