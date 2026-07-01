import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShoppingCart, 
  Heart, 
  Star, 
  ArrowLeft, 
  Truck, 
  ShieldCheck, 
  RefreshCcw,
  Minus,
  Plus,
  Download,
  FileText,
  Monitor
} from 'lucide-react';
import B2BPriceBadge from '../components/common/B2BPriceBadge';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import Button from '../components/common/Button';
import Skeleton from '../components/common/Skeleton';
import apiClient from '../services/apiClient';
import { retrieveStoreProduct } from '../services/medusa/productService';
import { normalizeStoreProduct } from '../lib/medusa/normalize';
import { addToCart } from '../redux/cartSlice';
import { toggleWishlist } from '../redux/wishlistSlice';
import useToast from '../hooks/useToast';
import { resolveMedusaImageUrl, PRODUCT_IMAGE_FALLBACK } from '../utils/medusaImage';
import useMedusaCart from '../hooks/useMedusaCart';
import { getVariantDisplayPrice } from '../utils/productPricing';

const ProductDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { showToast } = useToast();
  const { addVariant } = useMedusaCart();
  
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [activeImage, setActiveImage] = useState(0);
  
  const [purchaseType, setPurchaseType] = useState('one_time'); // one_time or subscription
  const [subscriptionPlan, setSubscriptionPlan] = useState('monthly'); // weekly, monthly, quarterly, yearly

  useEffect(() => {
    const PRODUCT_FIELDS = "id,title,handle,description,thumbnail,images.*,variants.*,variants.prices.*,variants.calculated_price.*,categories.*";

    const fetchProduct = async () => {
      setLoading(true);
      try {
        // Primary fetch — region-scoped (requires product-to-region mapping)
        const product = await retrieveStoreProduct(id);
        setProduct(product);
        if (product?.variants?.length > 0) {
          setSelectedVariantId(product.variants[0].id);
        }
      } catch (error) {
        // If region_id scoping 404s, fallback: fetch by ID with essential fields only
        if (error?.response?.status === 404) {
          console.warn('Product not found in region, fetching without region_id...');
          try {
            const data = await apiClient.get(`/store/products/${id}`, {
              params: { fields: PRODUCT_FIELDS }
            });
            const product = normalizeStoreProduct(data.product);
            setProduct(product);
            if (product?.variants?.length > 0) {
              setSelectedVariantId(product.variants[0].id);
            }
            return;
          } catch (fallbackError) {
            console.error('Fallback fetch also failed:', fallbackError);
          }
        } else {
          console.error('Failed to fetch product:', error);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [id]);

  const isDigitalProduct = useMemo(() => {
    if (!product) return false;
    const meta = product?.metadata || {};
    const productType = product?.type?.value || '';
    return (
      meta?.is_digital === true || 
      meta?.is_digital === 'true' ||
      productType === 'Digital Product'
    );
  }, [product]);

  const isSubscriptionProduct = useMemo(() => {
    if (!product) return false;
    const title = product.title.toLowerCase();
    const handle = product.handle?.toLowerCase() || "";
    return (
      product.metadata?.is_subscription === true ||
      title.includes("subscription") ||
      title.includes("membership") ||
      title.includes("weekly organic box") ||
      title.includes("monthly organic box") ||
      handle.includes("subscription") ||
      handle.includes("membership")
    );
  }, [product]);

  const mustBeSubscription = useMemo(() => {
    if (!product) return false;
    const title = product.title.toLowerCase();
    return title.includes("membership") || title.includes("subscription");
  }, [product]);

  useEffect(() => {
    if (mustBeSubscription) {
      setPurchaseType('subscription');
    }
  }, [mustBeSubscription]);

  const activeVariant = useMemo(() => {
    return product?.variants?.find(v => v.id === selectedVariantId) || product?.variants?.[0];
  }, [product, selectedVariantId]);

  const price = useMemo(() => {
    return getVariantDisplayPrice(activeVariant).amount;
  }, [activeVariant]);

  const handleAddToCart = async () => {
    if (!selectedVariantId) return;
    try {
      const metadata = {};
      if (purchaseType === 'subscription' || isSubscriptionProduct) {
        metadata.is_subscription = true;
        metadata.subscription_plan = subscriptionPlan;
      }
      // Pass digital product metadata so it flows through to order line items
      if (isDigitalProduct) {
        metadata.is_digital = true;
        if (product?.metadata?.version) metadata.version = product.metadata.version;
        if (product?.metadata?.download_limit) metadata.download_limit = product.metadata.download_limit;
        if (product?.metadata?.download_expiry_days) metadata.download_expiry_days = product.metadata.download_expiry_days;
        if (product?.metadata?.license_required) metadata.license_required = product.metadata.license_required;
      }
      await addVariant({ 
        variantId: selectedVariantId, 
        quantity,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined
      });
      showToast(`${product.title} added to cart`, "success");
    } catch (error) {
      showToast("Failed to add to cart", "error");
    }
  };

  const handleToggleWishlist = () => {
    dispatch(toggleWishlist(product));
    showToast("Wishlist updated", "success");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary">
        <Navbar />
        <div className="pt-32 container-custom grid lg:grid-cols-2 gap-12">
          <Skeleton className="aspect-square rounded-[2.5rem]" />
          <div className="flex flex-col gap-6">
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-6 w-1/4" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-12 w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) return <div className="pt-40 text-center">Product not found</div>;

  const images = product.images?.length > 0 ? product.images : [{ url: product.thumbnail }];

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      
      <main className="pt-32 pb-20 container-custom">
        {/* Back Button */}
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm font-bold text-text-secondary hover:text-accent-primary mb-8 transition-colors"
        >
          <ArrowLeft size={18} /> Back to Garden
        </button>

        <div className="grid lg:grid-cols-2 gap-16">
          {/* Image Gallery */}
          <div className="flex flex-col gap-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative aspect-square rounded-[3rem] overflow-hidden bg-white dark:bg-slate-800 shadow-premium border border-stone-100/50 dark:border-slate-700/50"
            >
              <img 
                src={resolveMedusaImageUrl(images[activeImage]?.url)} 
                alt={product.title}
                className="w-full h-full object-cover"
                onError={(e) => (e.target.src = PRODUCT_IMAGE_FALLBACK)}
              />
            </motion.div>
            
            {images.length > 1 && (
              <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImage(i)}
                    className={`relative w-24 h-24 shrink-0 rounded-2xl overflow-hidden border-4 transition-all ${
                      activeImage === i ? 'border-accent-primary scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={resolveMedusaImageUrl(img.url)} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="flex flex-col">
            <div className="flex items-center gap-1 mb-4">
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={16} className={i < 4 ? "fill-yellow-400 text-yellow-400" : "text-stone-300 dark:text-slate-600"} />
              ))}
              <span className="text-sm font-bold text-text-secondary ml-2">(128 Reviews)</span>
            </div>

            <h1 className="text-4xl md:text-6xl font-black text-text-primary mb-4 leading-tight">
              {product.title}
            </h1>
            
            <div className="flex items-center gap-3 mb-8">
              <p className="text-3xl font-black text-accent-primary">
                ${price.toFixed(2)}
              </p>
              <B2BPriceBadge />
            </div>

            <div className="prose prose-stone dark:prose-invert max-w-none mb-10">
              <p className="text-text-secondary leading-relaxed text-lg">
                {product.description || "Indulge in the purest taste of nature. Our organic products are harvested with care, ensuring every bite is packed with nutrients and authentic flavor. No pesticides, no GMOs, just pure goodness."}
              </p>
            </div>

            {/* Variants */}
            {product.variants?.length > 1 && (
              <div className="mb-10">
                <h4 className="text-xs font-black uppercase tracking-widest text-text-secondary mb-4">Select Option</h4>
                <div className="flex flex-wrap gap-3">
                  {product.variants.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVariantId(v.id)}
                      className={`px-6 py-3 rounded-2xl text-sm font-bold border-2 transition-all ${
                        selectedVariantId === v.id 
                        ? 'border-accent-primary bg-accent-primary/5 text-accent-primary' 
                        : 'border-stone-100 dark:border-slate-800 text-text-secondary hover:border-stone-200 dark:hover:border-slate-700'
                      }`}
                    >
                      {v.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Purchase Options */}
            {isSubscriptionProduct && (
              <div className="mb-10 flex flex-col gap-4">
                <h4 className="text-xs font-black uppercase tracking-widest text-text-secondary">Purchase Option</h4>
                
                <div className="flex flex-col gap-3">
                  {!mustBeSubscription && (
                    <label className={`flex items-center gap-4 p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                      purchaseType === 'one_time' 
                        ? 'border-accent-primary bg-accent-primary/5 text-accent-primary' 
                        : 'border-stone-100 dark:border-slate-800'
                    }`} onClick={() => setPurchaseType('one_time')}>
                      <input type="radio" checked={purchaseType === 'one_time'} onChange={() => setPurchaseType('one_time')} className="accent-accent-primary" />
                      <div className="flex-1">
                        <p className="font-bold text-text-primary text-sm">One-Time Purchase</p>
                        <p className="text-xs text-text-secondary">Buy once at regular price</p>
                      </div>
                    </label>
                  )}
                  
                  <label className={`flex items-center gap-4 p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                    purchaseType === 'subscription' 
                      ? 'border-accent-primary bg-accent-primary/5' 
                      : 'border-stone-100 dark:border-slate-800'
                  }`} onClick={() => setPurchaseType('subscription')}>
                    <input type="radio" checked={purchaseType === 'subscription'} onChange={() => setPurchaseType('subscription')} className="accent-accent-primary" />
                    <div className="flex-1">
                      <p className="font-bold text-text-primary text-sm">Subscribe & Save (10% Off)</p>
                      <p className="text-xs text-text-secondary font-medium">Set a recurring delivery schedule</p>
                    </div>
                  </label>
                </div>

                {purchaseType === 'subscription' && (
                  <div className="mt-4 p-6 bg-stone-50 dark:bg-slate-900 rounded-[1.5rem] border border-stone-100 dark:border-slate-800">
                    <h5 className="text-[10px] font-black uppercase tracking-widest text-text-secondary mb-3">Delivery Frequency</h5>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {['weekly', 'monthly', 'quarterly', 'yearly'].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setSubscriptionPlan(p)}
                          className={`py-2.5 px-3 text-xs font-black uppercase tracking-wider rounded-xl border-2 transition-all ${
                            subscriptionPlan === p
                              ? 'border-accent-primary bg-accent-primary/10 text-accent-primary'
                              : 'border-transparent bg-white dark:bg-slate-800 text-text-secondary'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Quantity and CTA */}
            <div className="flex flex-col sm:flex-row gap-6 items-center mb-12">
              <div className="flex items-center bg-stone-100 dark:bg-slate-800 rounded-2xl p-1 w-full sm:w-auto">
                <button 
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="p-3 hover:text-accent-primary transition-colors"
                >
                  <Minus size={20} />
                </button>
                <span className="w-12 text-center font-bold text-lg">{quantity}</span>
                <button 
                  onClick={() => setQuantity(quantity + 1)}
                  className="p-3 hover:text-accent-primary transition-colors"
                >
                  <Plus size={20} />
                </button>
              </div>
              <Button size="lg" className="w-full sm:flex-1 gap-3" onClick={handleAddToCart}>
                <ShoppingCart size={20} /> Add to Cart
              </Button>
              <button 
                onClick={handleToggleWishlist}
                className="p-4 rounded-2xl bg-stone-100 dark:bg-slate-800 text-text-secondary hover:text-accent-primary transition-colors"
              >
                <Heart size={24} />
              </button>
            </div>

            {/* Digital Product Badge */}
            {isDigitalProduct && (
              <div className="mb-10 p-5 rounded-2xl bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Download size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-blue-800 dark:text-blue-300">Digital Download</p>
                    <p className="text-[10px] font-bold text-blue-500/70">Instant access after purchase</p>
                  </div>
                </div>
                {(product?.metadata?.file_size || product?.metadata?.version) && (
                  <div className="flex flex-wrap gap-4 mt-3 text-xs text-blue-600 dark:text-blue-400 font-bold">
                    {product.metadata?.version && (
                      <span>Version: {product.metadata.version}</span>
                    )}
                    {product.metadata?.file_size && (
                      <span>Size: {(Number(product.metadata.file_size) / 1024 / 1024).toFixed(1)} MB</span>
                    )}
                    {product.metadata?.file_type && (
                      <span>Format: {product.metadata.file_type.toUpperCase()}</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Features List */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-10 border-t border-stone-100 dark:border-slate-800">
              {isDigitalProduct ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      <Download size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-tighter">Instant Download</p>
                      <p className="text-[10px] text-text-secondary">After payment confirmed</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-tighter">Secure Access</p>
                      <p className="text-[10px] text-text-secondary">Signed &amp; verified</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      <RefreshCcw size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-tighter">Re-Download</p>
                      <p className="text-[10px] text-text-secondary">Limited downloads allowed</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-accent-primary/10 text-accent-primary">
                      <Truck size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-tighter">Fast Delivery</p>
                      <p className="text-[10px] text-text-secondary">Free over $50</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-accent-primary/10 text-accent-primary">
                      <ShieldCheck size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-tighter">Pure Organic</p>
                      <p className="text-[10px] text-text-secondary">Certified 100%</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-accent-primary/10 text-accent-primary">
                      <RefreshCcw size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-tighter">Easy Returns</p>
                      <p className="text-[10px] text-text-secondary">30-day window</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
      <MobileNav />
    </div>
  );
};

export default ProductDetails;
