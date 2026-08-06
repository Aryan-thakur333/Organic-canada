import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Filter, SlidersHorizontal, Search, Grid, List, ArrowUpDown, Download } from 'lucide-react';
import Navbar from '../components/layout/Navbar';
import ProductCard from '../components/ProductCard';
import { ProductCardSkeleton } from '../components/common/Skeleton';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import { listStoreProducts, invalidateProductCache } from '../services/medusa/productService';
import { isRequestCanceled } from '../services/apiClient';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import { useRegion } from '../contexts/RegionContext';
import { REGION_SLUG_CONFIG, REGION_SLUGS, isKnownRegionSlug } from '../lib/medusa/regionSlugs';
import { createLatestRequestGuard } from '../lib/medusa/requestGuard';
import QuickViewModal from '../components/QuickViewModal';
import { STOREFRONT_PRODUCT_CANDIDATE_LIMIT, STOREFRONT_PRODUCT_PAGE_SIZE } from '../constants/storefront-products';
import { buildStorefrontListingPipeline, getPaginationPageNumbers } from '../utils/storefront-listing-pipeline';

const Listing = () => {
  const { regionSlug: routeRegionSlug } = useParams();
  const {
    region,
    regionSlug,
    loading: regionLoading,
    error: regionError,
    currencyCode,
    countryCode,
    setRegionBySlug,
  } = useRegion();
  const [rawProducts, setRawProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [viewMode, setViewMode] = useState('grid'); // grid or list
  const [productTypeFilter, setProductTypeFilter] = useState('all'); // all, digital, physical
  const [currentPage, setCurrentPage] = useState(1);
  const [quickProduct, setQuickProduct] = useState(null);
  const [catalogRefreshToken, setCatalogRefreshToken] = useState(0);
  const requestGuard = useRef(createLatestRequestGuard());
  const productGridRef = useRef(null);
  const lastCatalogFocusRefreshAt = useRef(0);

  useEffect(() => {
    lastCatalogFocusRefreshAt.current = Date.now();
    const refreshAfterAdminReturn = () => {
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastCatalogFocusRefreshAt.current < 500) return;
      lastCatalogFocusRefreshAt.current = now;
      invalidateProductCache();
      setCatalogRefreshToken((value) => value + 1);
    };
    window.addEventListener('focus', refreshAfterAdminReturn);
    document.addEventListener('visibilitychange', refreshAfterAdminReturn);
    return () => {
      window.removeEventListener('focus', refreshAfterAdminReturn);
      document.removeEventListener('visibilitychange', refreshAfterAdminReturn);
    };
  }, []);

  useEffect(() => {
    if (regionLoading) return;
    if (!routeRegionSlug || !isKnownRegionSlug(routeRegionSlug) || !region?.id) {
      setRawProducts([]);
      setLoadError('');
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const requestId = requestGuard.current.begin();
    const fetchProducts = async () => {
      setLoading(true);
      setLoadError('');
      setRawProducts([]);
      try {
        // Always fetch fresh on listing page mount — bust the local cache first
        invalidateProductCache();
        const result = await listStoreProducts({
          limit: STOREFRONT_PRODUCT_CANDIDATE_LIMIT,
          region_id: region.id,
          country_code: countryCode,
          fetch_all_pages: true,
          signal: controller.signal,
        });
        if (controller.signal.aborted || !requestGuard.current.isCurrent(requestId)) return;
        if (!result || !Array.isArray(result.products)) {
          throw new Error('Product service returned an invalid result');
        }
        if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_ORGANIC_APPLES === 'true') {
          const appleIndex = result.products.findIndex((product) => product.handle === 'organic-apples');
          console.info('ORGANIC_APPLES_LISTING_TRACE', { presentInRawResponse: appleIndex >= 0, rawIndex: appleIndex });
        }
        setRawProducts(result.products);
        if (import.meta.env.DEV) {
          if (import.meta.env.VITE_DEBUG_REGIONAL_PRICING === 'true') console.info('REGIONAL_PRICING_BATCH', { routeCountry: countryCode, regionId: region.id, expectedCurrency: currencyCode, productCount: result.products.length });
        }
      } catch (error) {
        if (controller.signal.aborted || !requestGuard.current.isCurrent(requestId) || isRequestCanceled(error)) return;
        console.error('Listing error:', error);
        setRawProducts([]);
        setLoadError(error instanceof Error ? error.message : 'Unable to load products');
      } finally {
        if (!controller.signal.aborted && requestGuard.current.isCurrent(requestId)) setLoading(false);
      }
    };
    fetchProducts();
    return () => controller.abort();
  }, [catalogRefreshToken, countryCode, currencyCode, region?.id, regionLoading, regionSlug, routeRegionSlug]);

  const listingPipeline = useMemo(() => buildStorefrontListingPipeline(rawProducts, {
    region, searchQuery, sortBy, productTypeFilter, currentPage, pageSize: STOREFRONT_PRODUCT_PAGE_SIZE,
  }), [currentPage, productTypeFilter, rawProducts, region, searchQuery, sortBy]);
  const { products: filteredAndSortedProducts, pagination } = listingPipeline;

  useEffect(() => {
    if (pagination.currentPage !== currentPage) setCurrentPage(pagination.currentPage);
  }, [currentPage, pagination.currentPage]);

  useEffect(() => {
    if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_STOREFRONT_LISTING === 'true') {
      console.info('STOREFRONT_LISTING_PIPELINE', { ...listingPipeline.counts, ...listingPipeline.reasonCounts });
    }
  }, [listingPipeline]);

  const changePage = (page) => {
    setCurrentPage(page);
    requestAnimationFrame(() => productGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const paginationPages = getPaginationPageNumbers(pagination.currentPage, pagination.totalPages);

  const regionOptions = useMemo(() => REGION_SLUGS.map((slug) => ({
    slug,
    ...REGION_SLUG_CONFIG[slug],
  })), []);

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      
      <main className="pt-32 pb-20 container-custom">
        {/* Header */}
        <div className="flex flex-col gap-8 mb-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h1 className="text-4xl md:text-6xl font-black text-text-primary mb-4">Our Garden.</h1>
              <p className="text-text-secondary max-w-lg">
                Freshly picked organic products from our local farms. 
                Filter through our wide variety of organic excellence.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={regionSlug || routeRegionSlug || ''}
                onChange={(event) => {
                  setCurrentPage(1);
                  setRegionBySlug(event.target.value);
                }}
                className="bg-white dark:bg-slate-800 border-2 border-stone-100 dark:border-slate-700 rounded-2xl py-3 px-4 outline-none focus:border-accent-primary transition-all text-sm font-bold"
              >
                {regionOptions.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.label} ({option.currencyCode.toUpperCase()})
                  </option>
                ))}
              </select>
              <div className="flex items-center bg-white dark:bg-slate-800 rounded-2xl p-1 shadow-sm border border-stone-100 dark:border-slate-700">
                <button 
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-xl transition-colors ${viewMode === 'grid' ? 'bg-accent-primary text-white' : 'text-text-secondary'}`}
                >
                  <Grid size={18} />
                </button>
                <button 
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-xl transition-colors ${viewMode === 'list' ? 'bg-accent-primary text-white' : 'text-text-secondary'}`}
                >
                  <List size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="flex flex-col lg:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary" size={20} />
              <input 
                type="text"
                placeholder="Search our garden..."
                value={searchQuery}
                onChange={(e) => {
                  setCurrentPage(1);
                  setSearchQuery(e.target.value);
                }}
                className="w-full bg-white dark:bg-slate-800 border-2 border-stone-100 dark:border-slate-700 rounded-[2rem] py-4 pl-12 pr-6 outline-none focus:border-accent-primary transition-all text-sm font-semibold"
              />
            </div>
            
            <div className="flex w-full lg:w-auto gap-4">
              {/* Product Type Filter */}
              <div className="relative flex-1 lg:min-w-[160px]">
                <Download className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary" size={16} />
                <select 
                  value={productTypeFilter}
                  onChange={(e) => {
                    setCurrentPage(1);
                    setProductTypeFilter(e.target.value);
                  }}
                  className="w-full appearance-none bg-white dark:bg-slate-800 border-2 border-stone-100 dark:border-slate-700 rounded-[2rem] py-4 pl-12 pr-10 outline-none focus:border-accent-primary transition-all text-sm font-bold"
                >
                  <option value="all">All Products</option>
                  <option value="digital">Digital Products</option>
                  <option value="physical">Physical Products</option>
                </select>
              </div>
              <div className="relative flex-1 lg:min-w-[200px]">
                <ArrowUpDown className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary" size={18} />
                <select 
                  value={sortBy}
                  onChange={(e) => {
                    setCurrentPage(1);
                    setSortBy(e.target.value);
                  }}
                  className="w-full appearance-none bg-white dark:bg-slate-800 border-2 border-stone-100 dark:border-slate-700 rounded-[2rem] py-4 pl-12 pr-10 outline-none focus:border-accent-primary transition-all text-sm font-bold"
                >
                  <option value="newest">Newest First</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="title">Name: A-Z</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Products Grid */}
        {!regionLoading && (regionError || !region) ? (
          <div className="py-40 text-center">
            <h3 className="text-2xl font-black mb-2">Region not found</h3>
            <p className="text-text-secondary">{regionError || 'This region is not available.'}</p>
            <Button className="mt-8" onClick={() => setRegionBySlug('usa')}>
              Go to Default Region
            </Button>
          </div>
        ) : loadError ? (
          <div className="py-40 text-center">
            <h3 className="text-2xl font-black mb-2">Unable to load products</h3>
            <p className="text-text-secondary">{loadError}</p>
          </div>
        ) : (loading || regionLoading) ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[...Array(8)].map((_, i) => <ProductCardSkeleton key={i} />)}
          </div>
        ) : filteredAndSortedProducts.length === 0 ? (
          <div className="py-40 text-center">
            <div className="inline-flex p-6 rounded-full bg-stone-100 dark:bg-slate-800 text-stone-400 dark:text-slate-600 mb-6">
              <Search size={48} />
            </div>
            <h3 className="text-2xl font-black mb-2">No products available for this region</h3>
            <p className="text-text-secondary">Try adjusting your search or filters to find what you're looking for.</p>
            <Button className="mt-8" onClick={() => { setCurrentPage(1); setSearchQuery(''); setSortBy('newest'); }}>
              Clear All Filters
            </Button>
          </div>
        ) : (
          <>
          <p className="mb-5 text-sm font-bold text-text-secondary" aria-live="polite">
            Showing {pagination.paginationStart + 1}-{pagination.paginationEnd} of {listingPipeline.counts.totalEligibleProducts} products
          </p>
          <div ref={productGridRef} className={`grid gap-8 ${viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1'}`}>
            {pagination.pageProducts.map((product) => (
              <ProductCard key={product.id} item={product} region={region} regionSlug={regionSlug} onQuickView={setQuickProduct} />
            ))}
          </div>
          </>
        )}
        {!loading && filteredAndSortedProducts.length > 0 && pagination.totalPages > 1 ? (
          <nav className="mt-10 flex flex-wrap items-center justify-center gap-2" aria-label="Product pages">
            <button type="button" onClick={() => changePage(Math.max(1, pagination.currentPage - 1))} disabled={pagination.currentPage === 1} className="rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-40">Previous</button>
            {paginationPages.map((page, index) => <React.Fragment key={page}>
              {index > 0 && page - paginationPages[index - 1] > 1 ? <span aria-hidden="true" className="px-1 text-text-secondary">...</span> : null}
              <button type="button" aria-label={`Page ${page}`} aria-current={page === pagination.currentPage ? 'page' : undefined} onClick={() => changePage(page)} className={`min-w-10 rounded-xl border px-3 py-2 text-sm font-bold ${page === pagination.currentPage ? 'border-accent-primary bg-accent-primary text-white' : ''}`}>{page}</button>
            </React.Fragment>)}
            <button type="button" onClick={() => changePage(Math.min(pagination.totalPages, pagination.currentPage + 1))} disabled={pagination.currentPage === pagination.totalPages} className="rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-40">Next</button>
          </nav>
        ) : null}
      </main>

      <Footer />
      <MobileNav />
      <QuickViewModal product={quickProduct} onClose={() => setQuickProduct(null)} />
    </div>
  );
};

export default Listing;
