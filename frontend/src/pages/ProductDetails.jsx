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
  ,UploadCloud
} from 'lucide-react';
import B2BPriceBadge from '../components/common/B2BPriceBadge';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import Button from '../components/common/Button';
import Skeleton from '../components/common/Skeleton';
import apiClient from '../services/apiClient';
import { retrieveStoreProduct } from '../services/medusa/productService';
import { addToCart } from '../redux/cartSlice';
import { toggleWishlist } from '../redux/wishlistSlice';
import useToast from '../hooks/useToast';
import { resolveMedusaImageUrl, PRODUCT_IMAGE_FALLBACK } from '../utils/medusaImage';
import useMedusaCart from '../hooks/useMedusaCart';
import { getVariantDisplayPrice } from '../utils/productPricing';
import { isRequestCanceled } from '../services/apiClient';
import { useRegion } from '../contexts/RegionContext';
import { formatCurrency, getLocaleForCurrency } from '../lib/medusa/money';
import { commerceFeatures } from '../config/commerceFeatures';

const ProductDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { showToast } = useToast();
  const { addVariant, addPersonalizedVariant, addBundleVariant } = useMedusaCart();
  const { region, regionSlug, currencyCode, countryCode, loading: regionLoading, error: regionError } = useRegion();
  
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [activeImage, setActiveImage] = useState(0);
  const [isAdding, setIsAdding] = useState(false);

  // Personalization states
  const [personalizationTemplate, setPersonalizationTemplate] = useState(null);
  const [personalizationLoading, setPersonalizationLoading] = useState(false);
  const [personalizationResolutionError, setPersonalizationResolutionError] = useState('');
  const [personalizationValues, setPersonalizationValues] = useState({});
  const [validationErrors, setValidationErrors] = useState({});
  const [priceAdjustment, setPriceAdjustment] = useState(0);
  const [personalizationQuote, setPersonalizationQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [uploadingField, setUploadingField] = useState('');
  const [uploadProgress, setUploadProgress] = useState({});
  const [uploadPreviews, setUploadPreviews] = useState({});
  const [subscriptionConfig, setSubscriptionConfig] = useState(null);
  const [bundleDetails, setBundleDetails] = useState(null);
  
  const [personalizationFields, setPersonalizationFields] = useState([]);
  const [personalizationVersion, setPersonalizationVersion] = useState(0);
  const [personalizationRequiredMode, setPersonalizationRequiredMode] = useState(false);
  const [personalizationAllowNormalPurchase, setPersonalizationAllowNormalPurchase] = useState(true);
  
  const [purchaseType, setPurchaseType] = useState('one_time'); // one_time or subscription
  const [subscriptionPlan, setSubscriptionPlan] = useState('MONTH');

  useEffect(() => {
    const controller = new AbortController();
    const fetchProduct = async () => {
      if (!region?.id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const product = await retrieveStoreProduct(id, {
          region_id: region.id,
          country_code: countryCode,
          signal: controller.signal,
        });
        setProduct(product);
        if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_REGIONAL_PRICING === 'true') {
          console.log('REGION PRODUCT REQUEST', {
            routeSlug: regionSlug,
            productId: id,
            regionId: region.id,
            currencyCode,
            countryCode,
            calculatedPrice: product?.variants?.[0]?.calculated_price,
          });
        }
        if (product?.variants?.length > 0) {
          setSelectedVariantId(product.variants[0].id);
        }
      } catch (error) {
        if (controller.signal.aborted || isRequestCanceled(error)) return;
        console.error('Failed to fetch product for selected region:', error);
        setProduct(null);
      } finally {
        setLoading(false);
      }
    };
    if (!regionLoading) fetchProduct();
    return () => controller.abort();
  }, [countryCode, currencyCode, id, region?.id, regionLoading, regionSlug]);

  const isPersonalizedProduct = useMemo(() => {
    return commerceFeatures.personalizedProducts && Boolean(personalizationTemplate);
  }, [personalizationTemplate]);

  useEffect(() => {
    const resetPersonalization = () => {
      setPersonalizationTemplate(null);
      setPersonalizationResolutionError('');
      setPersonalizationValues({});
      setValidationErrors({});
      setPriceAdjustment(0);
      setPersonalizationQuote(null);
      setUploadPreviews({});
      setPersonalizationFields([]);
      setPersonalizationVersion(0);
      setPersonalizationRequiredMode(false);
      setPersonalizationAllowNormalPurchase(true);
    };

    if (!product || !commerceFeatures.personalizedProducts) {
      resetPersonalization();
      setPersonalizationLoading(false);
      return;
    }

    const controller = new AbortController();
    resetPersonalization();
    setPersonalizationLoading(true);
    apiClient.get(`/store/products/${product.id}/personalization`, {
      params: { variant_id: selectedVariantId || undefined },
      signal: controller.signal,
    })
    .then((res) => {
      const body = res?.data ?? res;
      const template = body?.template ?? body?.personalization?.template ?? null;
      setPersonalizationTemplate(template);
      if (template) {
        setPersonalizationFields(template.fields || []);
        setPersonalizationVersion(Number(template.version || 1));
        setPersonalizationRequiredMode(Boolean(template.personalization_required));
        setPersonalizationAllowNormalPurchase(template.allow_normal_purchase !== false);
      }
      setPersonalizationResolutionError('');
    })
    .catch((err) => {
      if (controller.signal.aborted || isRequestCanceled(err)) return;
      console.warn("No personalization template active for this variant/product", err);
      resetPersonalization();
      const status = Number(err?.response?.status || err?.status || 0);
      const code = err?.response?.data?.code || err?.data?.code;
      if (status === 409 || code === 'PERSONALIZATION_TEMPLATE_AMBIGUOUS') {
        setPersonalizationResolutionError('Personalization is temporarily unavailable for this option. Please choose another option or try again later.');
      }
    })
    .finally(() => {
      if (!controller.signal.aborted) setPersonalizationLoading(false);
    });
    return () => controller.abort();
  }, [product, selectedVariantId]);

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

  // isBundleProduct is determined by the explicit bundle API lookup, not just metadata
  // We use metadata as a hint to show a loading state earlier, but always call the API
  const metadataHintIsBundle = commerceFeatures.bundledProducts && product?.metadata?.product_type === 'bundle';
  const isBundleProduct = useMemo(() => commerceFeatures.bundledProducts && bundleDetails !== null, [bundleDetails]);

  const [bundleError, setBundleError] = useState(null); // null | 'config_invalid' | 'server_error' | 'region_context'

  useEffect(() => {
    if (!commerceFeatures.bundledProducts || !product?.id || !region?.id || !countryCode) {
      setBundleDetails(null);
      setBundleError(null);
      return;
    }
    const controller = new AbortController();
    const salesChannelId = (import.meta.env.VITE_MEDUSA_SALES_CHANNEL_ID || '');
    const params = {
      region_id: region.id,
      country_code: countryCode,
      ...(salesChannelId ? { sales_channel_id: salesChannelId } : {}),
    };
    apiClient.get(`/store/bundles/by-product/${product.id}`, { params, signal: controller.signal })
      .then(response => {
        setBundleDetails(response.bundle || response.data?.bundle || null);
        setBundleError(null);
      })
      .catch(error => {
        if (controller.signal.aborted || isRequestCanceled(error)) return;
        const status = error?.response?.status || error?.status;
        const code = error?.response?.data?.code || error?.data?.code;
        if (status === 404 && code === 'BUNDLE_NOT_FOUND') {
          // Normal product — not a bundle
          setBundleDetails(null);
          setBundleError(null);
        } else if (status === 422 || code === 'BUNDLE_CONFIGURATION_INVALID') {
          setBundleDetails(null);
          setBundleError('config_invalid');
          console.warn('[Bundle] Configuration error:', error?.response?.data?.message);
        } else if (status === 400 || code === 'BUNDLE_REGION_CONTEXT_REQUIRED') {
          setBundleDetails(null);
          setBundleError('region_context');
        } else if (status >= 500) {
          setBundleDetails(null);
          setBundleError('server_error');
          console.error('[Bundle] Server error loading bundle:', error?.response?.data?.message || error.message);
        } else {
          // Unknown error — treat as non-bundle
          setBundleDetails(null);
          setBundleError(null);
        }
      });
    return () => controller.abort();
  }, [countryCode, product?.id, region?.id]);

  useEffect(() => {
    if (!commerceFeatures.subscriptions || !product?.id || !selectedVariantId) {
      setSubscriptionConfig(null);
      return;
    }
    const controller = new AbortController();
    apiClient.get(`/store/products/${product.id}/subscription-options`, {
      params: { variant_id: selectedVariantId },
      signal: controller.signal,
    }).then((result) => {
      const config = result?.subscription || result?.data?.subscription || null;
      setSubscriptionConfig(config);
      const first = config?.allowed_intervals?.[0];
      if (first) setSubscriptionPlan(String(first).toUpperCase());
      if (config?.one_time_purchase_allowed === false) setPurchaseType('subscription');
    }).catch((error) => {
      if (controller.signal.aborted || isRequestCanceled(error)) return;
      const status = error?.response?.status || error?.status;
      const code = error?.response?.data?.code || error?.data?.code;
      // 404 means subscription feature is disabled or not available for this product — expected, not an error
      if (status === 404 || code === 'SUBSCRIPTION_NOT_AVAILABLE' || code === 'FEATURE_DISABLED') {
        setSubscriptionConfig(null);
        return; // Silently ignored — not a subscription product
      }
      // 500 / network errors remain visible
      if (!controller.signal.aborted && !isRequestCanceled(error)) {
        console.error('[Subscription] Error loading subscription options:', error?.response?.data?.message || error.message);
        setSubscriptionConfig(null);
      }
    });
    return () => controller.abort();
  }, [product?.id, selectedVariantId]);

  const isSubscriptionProduct = useMemo(() => {
    return commerceFeatures.subscriptions && subscriptionConfig?.enabled === true;
  }, [subscriptionConfig]);

  const mustBeSubscription = useMemo(() => {
    return isSubscriptionProduct && subscriptionConfig?.one_time_purchase_allowed === false;
  }, [isSubscriptionProduct, subscriptionConfig]);

  useEffect(() => {
    if (mustBeSubscription) {
      setPurchaseType('subscription');
    }
  }, [mustBeSubscription]);

  const activeVariant = useMemo(() => {
    return product?.variants?.find(v => v.id === selectedVariantId) || product?.variants?.[0];
  }, [product, selectedVariantId]);

  const price = useMemo(() => {
    return getVariantDisplayPrice(activeVariant, { region });
  }, [activeVariant, region]);

  const finalPrice = useMemo(() => {
    if (!price.hasPrice) return null;
    return price.amount + priceAdjustment;
  }, [price, priceAdjustment]);

  const formattedFinalPrice = useMemo(() => {
    if (finalPrice === null) return 'Price unavailable in this region';
    const currency = price.currencyCode || region?.currency_code || 'usd';
    return formatCurrency(finalPrice, currency, getLocaleForCurrency(currency));
  }, [finalPrice, price.currencyCode, region?.currency_code]);

  const formattedBasePrice = useMemo(() => {
    if (!price.hasPrice) return 'Unavailable';
    const currency = price.currencyCode || region?.currency_code || 'usd';
    return formatCurrency(price.amount, currency, getLocaleForCurrency(currency));
  }, [price.amount, price.currencyCode, price.hasPrice, region?.currency_code]);

  const formattedPriceAdjustment = useMemo(() => {
    const currency = price.currencyCode || region?.currency_code || 'usd';
    return formatCurrency(priceAdjustment, currency, getLocaleForCurrency(currency));
  }, [price.currencyCode, priceAdjustment, region?.currency_code]);

  const handlePersonalizationChange = (key, val, field) => {
    setPersonalizationValues(prev => {
      const updated = { ...prev, [key]: val };
      setPersonalizationQuote(null);
      return updated;
    });

    // Validate field locally
    let error = "";
    if (field.is_required && (!val || val === "")) {
      error = "This field is required";
    } else if (field.field_type === "text" && field.max_length && val.length > field.max_length) {
      error = `Maximum ${field.max_length} characters allowed`;
    } else if (field.field_type === "text" && field.min_length && val.length < field.min_length) {
      error = `Minimum ${field.min_length} characters required`;
    } else if (field.field_type === "number") {
      const num = Number(val);
      if (field.max_value !== null && num > field.max_value) {
        error = `Maximum value is ${field.max_value}`;
      } else if (field.min_value !== null && num < field.min_value) {
        error = `Minimum value is ${field.min_value}`;
      }
    }

    setValidationErrors(prev => ({
      ...prev,
      [key]: error
    }));
  };

  const hasPersonalizationValues = useMemo(() => Object.values(personalizationValues).some((value) => value !== undefined && value !== null && value !== '' && value !== false), [personalizationValues]);

  const requiredPersonalizationComplete = useMemo(() => {
    if (!personalizationTemplate) return true;
    const requiredFieldsComplete = (personalizationTemplate.fields || []).every((field) => {
      if (!field.is_required) return true;
      const value = personalizationValues[field.key];
      return value !== undefined && value !== null && value !== '';
    });
    const mustPersonalize = personalizationTemplate.personalization_required || personalizationTemplate.allow_normal_purchase === false;
    return requiredFieldsComplete && (!mustPersonalize || hasPersonalizationValues);
  }, [hasPersonalizationValues, personalizationTemplate, personalizationValues]);

  useEffect(() => {
    if (!isPersonalizedProduct || !personalizationTemplate || !selectedVariantId || !region?.id || !requiredPersonalizationComplete || !hasPersonalizationValues) {
      setPersonalizationQuote(null);
      setPriceAdjustment(0);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setQuoteLoading(true);
      try {
        const response = await apiClient.post('/store/personalizations/quote', {
          variant_id: selectedVariantId,
          region_id: region.id,
          values: personalizationValues,
        }, { signal: controller.signal });
        // apiClient's response interceptor returns the JSON body directly.
        // Keep the nested fallback for callers/tests that provide an Axios-like response.
        const quote = response?.quote || response?.data?.quote;
        setPersonalizationQuote(quote || null);
        setPriceAdjustment(Number(quote?.adjustment || 0));
      } catch (error) {
        if (!controller.signal.aborted && !isRequestCanceled(error)) {
          setPersonalizationQuote(null);
          setPriceAdjustment(0);
        }
      } finally {
        if (!controller.signal.aborted) setQuoteLoading(false);
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [hasPersonalizationValues, isPersonalizedProduct, personalizationTemplate, personalizationValues, region?.id, requiredPersonalizationComplete, selectedVariantId]);

  const handlePersonalizationImage = async (field, file) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setValidationErrors(prev => ({ ...prev, [field.key]: 'Use a JPEG, PNG, or WebP image up to 5 MB' }));
      return;
    }
    setUploadingField(field.id);
    setUploadProgress(prev => ({ ...prev, [field.key]: 0 }));
    try {
      const contentBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.readAsDataURL(file);
      });
      const response = await apiClient.post('/store/personalizations/uploads', {
        template_id: personalizationTemplate.id,
        field_id: field.id,
        filename: file.name,
        mime_type: file.type,
        content_base64: contentBase64,
      }, { onUploadProgress: (event) => setUploadProgress(prev => ({ ...prev, [field.key]: event.total ? Math.round((event.loaded * 100) / event.total) : 0 })) });
      const uploadId = response?.upload_id || response?.data?.upload_id;
      handlePersonalizationChange(field.key, uploadId, field);
      setUploadPreviews(prev => ({ ...prev, [field.key]: URL.createObjectURL(file) }));
    } catch (error) {
      setValidationErrors(prev => ({ ...prev, [field.key]: error.response?.data?.message || 'Image upload failed' }));
    } finally {
      setUploadingField('');
    }
  };

  const removePersonalizationImage = (field) => {
    const preview = uploadPreviews[field.key];
    if (preview) URL.revokeObjectURL(preview);
    setUploadPreviews(prev => { const next = { ...prev }; delete next[field.key]; return next; });
    setUploadProgress(prev => { const next = { ...prev }; delete next[field.key]; return next; });
    handlePersonalizationChange(field.key, '', field);
  };

  const handleAddToCart = async () => {
    if (isAdding) return;
    if (isBundleProduct) {
      if (!bundleDetails) {
        showToast('Bundle details are not loaded yet', 'error');
        return;
      }
      if (bundleDetails.availability?.available_quantity < quantity) {
        showToast('Insufficient bundle component inventory', 'error');
        return;
      }
    } else if (!selectedVariantId) {
      return;
    } else if (!price.hasPrice) {
      showToast('Price unavailable in this region', 'error');
      return;
    }
    setIsAdding(true);
    try {
      if (isBundleProduct) {
        if (!bundleDetails?.id) throw new Error('Bundle configuration is not available');
        await addBundleVariant({
          bundleId: bundleDetails.id,
          quantity,
          countryCode,
        });
      } else if (isPersonalizedProduct && (hasPersonalizationValues || personalizationTemplate?.personalization_required || personalizationTemplate?.allow_normal_purchase === false)) {
        // Validate all required fields
        const errors = {};
        let hasError = false;
        if (personalizationTemplate?.fields) {
          for (const f of personalizationTemplate.fields) {
            const v = personalizationValues[f.key];
            if (f.is_required && (v === undefined || v === "")) {
              errors[f.key] = "This field is required";
              hasError = true;
            }
          }
        }
        if (hasError) {
          setValidationErrors(errors);
          showToast("Please fill all required customization fields", "error");
          setIsAdding(false);
          return;
        }

        if (!personalizationQuote) {
          showToast("Wait for the server price quote before adding", "error");
          setIsAdding(false);
          return;
        }
        const normalizedValues = personalizationQuote.normalized_values;
        await addPersonalizedVariant({
          variantId: selectedVariantId,
          quantity,
          values: normalizedValues,
          uploadIds: Object.values(normalizedValues).filter(value => typeof value === 'string' && value.startsWith('past_'))
        });
      } else {
        const metadata = {};
        if (purchaseType === 'subscription' || isSubscriptionProduct) {
          metadata.is_subscription = true;
          metadata.subscription_interval = subscriptionPlan;
          metadata.subscription_interval_count = 1;
        }
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
          currencyCode: price.currencyCode,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined
        });
      }
      showToast(`${product.title} added to cart`, "success");
    } catch (error) {
      showToast(error.response?.data?.message || "Failed to add to cart", "error");
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggleWishlist = () => {
    dispatch(toggleWishlist(product));
    showToast("Wishlist updated", "success");
  };

  const personalizationInvalid = useMemo(() => {
    if (!isPersonalizedProduct || !personalizationTemplate) return false;
    return (
      !requiredPersonalizationComplete ||
      quoteLoading ||
      Boolean(uploadingField) ||
      (personalizationTemplate.allow_normal_purchase === false && !personalizationQuote) ||
      (hasPersonalizationValues && !personalizationQuote)
    );
  }, [isPersonalizedProduct, personalizationTemplate, requiredPersonalizationComplete, quoteLoading, uploadingField, personalizationQuote, hasPersonalizationValues]);

  const personalizationButtonText = useMemo(() => {
    if (isAdding) return "Adding...";
    if (personalizationLoading) return "Loading options...";
    if (personalizationResolutionError) return "Personalization unavailable";
    if (quoteLoading) return "Calculating...";
    
    if (isPersonalizedProduct && personalizationTemplate) {
      if (personalizationTemplate.allow_normal_purchase === false || hasPersonalizationValues) {
        return "Add Personalized Product";
      }
    }
    return "Add to Cart";
  }, [isAdding, personalizationLoading, personalizationResolutionError, quoteLoading, isPersonalizedProduct, personalizationTemplate, hasPersonalizationValues]);

  if (loading || regionLoading) {
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

  if (regionError || (!regionLoading && !region)) {
    return <div className="pt-40 text-center">{regionError || "Region not configured"}</div>;
  }

  if (!product) return <div className="pt-40 text-center">Product not available in this region</div>;

  const images = product.images?.length > 0 ? product.images : [{ url: product.thumbnail }];

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      
      <main className="pt-32 pb-20 container-custom">
        {/* Back Button */}
        <button 
          onClick={() => navigate(`/shop/${regionSlug || 'usa'}`)}
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
            
            <div className="flex flex-col gap-1 mb-8">
              <div className="flex items-center gap-3">
                <p className="text-3xl font-black text-accent-primary">
                  {formattedFinalPrice}
                </p>
                <B2BPriceBadge />
              </div>
              {priceAdjustment > 0 && (
                <span className="text-xs text-purple-600 dark:text-purple-400 font-bold bg-purple-500/10 px-2.5 py-1 rounded-lg w-fit">
                  Includes +{formattedPriceAdjustment} personalization charges
                </span>
              )}
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
                      {(subscriptionConfig?.allowed_intervals || []).map((p) => (
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
                          {String(p).toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Customization Fields Form */}
            {personalizationResolutionError && (
              <div role="alert" className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                {personalizationResolutionError}
              </div>
            )}
            {isPersonalizedProduct && personalizationTemplate && (
              <div className="mb-10 p-6 rounded-[2rem] bg-purple-50 dark:bg-purple-950/10 border border-purple-100 dark:border-purple-900/20 flex flex-col gap-6">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-purple-600 dark:text-purple-400 mb-1">Personalize Your Product</h4>
                  <p className="text-[10px] text-stone-500 font-bold">{personalizationTemplate.description || 'Personalize this item to your liking'}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-white/70 dark:bg-slate-900/50 p-3 text-[10px] font-bold">
                    <div><span className="block text-stone-400">Base price</span>{formattedBasePrice}</div>
                    <div><span className="block text-stone-400">Personalization</span>{formattedPriceAdjustment}</div>
                    <div><span className="block text-stone-400">Final quote</span>{personalizationQuote ? formattedFinalPrice : 'Enter options'}</div>
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  {(personalizationTemplate.fields || [])
                    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                    .map((field) => {
                      const value = personalizationValues[field.key] ?? "";
                      const error = validationErrors[field.key];
                      
                      return (
                        <div key={field.id} className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                            {field.label}
                            {field.is_required && <span className="text-red-500 font-black">*</span>}
                            {field.price_adjustment > 0 && (
                              <span className="text-[9px] font-black uppercase bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded">
                                +{formatCurrency(Number(field.price_adjustment), price.currencyCode || region?.currency_code || 'usd', getLocaleForCurrency(price.currencyCode || region?.currency_code || 'usd'))}
                              </span>
                            )}
                          </label>

                          {field.field_type === "image_upload" ? (
                            <div className="flex flex-col gap-2">
                              <label onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); handlePersonalizationImage(field, event.dataTransfer.files?.[0]); }} className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-purple-200 dark:border-purple-800 bg-white dark:bg-slate-800 p-4 cursor-pointer text-xs font-bold text-purple-600">
                                <UploadCloud size={18} /> {uploadingField === field.id ? 'Uploading...' : 'Upload JPEG, PNG, or WebP (max 5 MB)'}
                                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploadingField === field.id} onChange={(e) => handlePersonalizationImage(field, e.target.files?.[0])} />
                              </label>
                              {uploadingField === field.id && <div className="h-1.5 overflow-hidden rounded bg-purple-100"><div className="h-full bg-purple-500 transition-all" style={{ width: `${uploadProgress[field.key] || 0}%` }} /></div>}
                              {uploadPreviews[field.key] && <div className="flex items-start gap-2"><img src={uploadPreviews[field.key]} alt="Personalization preview" className="h-28 w-28 rounded-xl object-cover border border-purple-200" /><button type="button" onClick={() => removePersonalizationImage(field)} className="text-xs font-bold text-red-600">Remove / replace</button></div>}
                            </div>
                          ) : field.field_type === "textarea" ? (
                            <textarea
                              value={value}
                              onChange={(e) => handlePersonalizationChange(field.key, e.target.value, field)}
                              placeholder={field.placeholder || ""}
                              minLength={field.min_length ?? undefined}
                              maxLength={field.max_length ?? undefined}
                              className="w-full bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-xl p-3 text-sm font-semibold outline-none focus:border-purple-500"
                              rows={3}
                            />
                          ) : field.field_type === "select" ? (
                            <select
                              value={value}
                              onChange={(e) => handlePersonalizationChange(field.key, e.target.value, field)}
                              className="w-full bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-xl p-3 text-sm font-semibold outline-none focus:border-purple-500"
                            >
                              <option value="">Select option...</option>
                              {(typeof field.allowed_values === "string" 
                                ? field.allowed_values.split(",").map(v => v.trim()) 
                                : (Array.isArray(field.allowed_values) ? field.allowed_values : [])
                              ).map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : field.field_type === "radio" ? (
                            <div role="radiogroup" aria-label={field.label} className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                              {(typeof field.allowed_values === "string"
                                ? field.allowed_values.split(",").map((option) => option.trim()).filter(Boolean)
                                : (Array.isArray(field.allowed_values) ? field.allowed_values : [])
                              ).map((option) => (
                                <label key={option} className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-text-primary">
                                  <input
                                    type="radio"
                                    name={`personalization-${field.key}`}
                                    value={option}
                                    checked={value === option}
                                    onChange={(event) => handlePersonalizationChange(field.key, event.target.value, field)}
                                    className="accent-purple-500"
                                  />
                                  <span>{option}</span>
                                </label>
                              ))}
                            </div>
                          ) : field.field_type === "checkbox" || field.field_type === "boolean" ? (
                            <label className="flex items-center gap-2 cursor-pointer py-1">
                              <input
                                type="checkbox"
                                checked={value === true || value === "true"}
                                onChange={(e) => handlePersonalizationChange(field.key, e.target.checked, field)}
                                className="accent-purple-500"
                              />
                              <span className="text-xs text-text-secondary font-medium">Enable option</span>
                            </label>
                          ) : (
                            <input
                              type={field.field_type === "number" ? "number" : (field.field_type === "color" ? "color" : (field.field_type === "date" ? "date" : "text"))}
                              value={value}
                              onChange={(e) => handlePersonalizationChange(field.key, e.target.value, field)}
                              placeholder={field.placeholder || ""}
                              minLength={field.min_length ?? undefined}
                              maxLength={field.max_length ?? undefined}
                              min={field.min_value ?? undefined}
                              max={field.max_value ?? undefined}
                              className="w-full bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-xl p-3 text-sm font-semibold outline-none focus:border-purple-500"
                            />
                          )}

                          {error && <span className="text-[10px] text-red-500 font-bold">{error}</span>}
                          {field.help_text && <span className="text-[9px] text-stone-400 font-medium">{field.help_text}</span>}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Bundle error states */}
            {bundleError === 'config_invalid' && (
              <div className="mb-10 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/10 border border-amber-200 text-xs font-bold text-amber-700">
                Bundle configuration is incomplete. Please contact support.
              </div>
            )}
            {bundleError === 'server_error' && (
              <div className="mb-10 p-4 rounded-2xl bg-red-50 dark:bg-red-950/10 border border-red-200 text-xs font-bold text-red-700">
                Unable to load bundle details. Please try again.
              </div>
            )}

            {isBundleProduct && bundleDetails && (
              <div className="mb-10 p-6 rounded-[2rem] bg-emerald-50 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-900/20">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xs font-black uppercase tracking-widest text-emerald-700">Fixed Bundle</h4>
                  <span className="text-xs font-bold">{bundleDetails.availability?.available_quantity ?? 0} available</span>
                </div>
                <div className="flex flex-col gap-3">{(bundleDetails.components || []).map(component => (
                  <div key={component.variant_id} className="flex items-center gap-3 rounded-xl bg-white dark:bg-slate-800 p-3">
                    {component.product?.thumbnail && <img src={resolveMedusaImageUrl(component.product.thumbnail)} alt="" className="h-12 w-12 rounded-lg object-cover" />}
                    <div className="flex-1"><p className="text-sm font-bold">{component.product?.title}</p><p className="text-xs text-text-secondary">{component.title}{component.sku ? ` · ${component.sku}` : ''}</p></div>
                    <span className="text-sm font-black">× {component.quantity}</span>
                  </div>
                ))}</div>
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
              <Button size="lg" className="w-full sm:flex-1 gap-3" onClick={handleAddToCart} disabled={isAdding || personalizationLoading || Boolean(personalizationResolutionError) || (isBundleProduct ? (!bundleDetails || (bundleDetails.availability?.available_quantity ?? 0) < quantity) : !price.hasPrice) || personalizationInvalid}>
                <ShoppingCart size={20} /> {personalizationButtonText}
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
                      <p className="text-[10px] text-text-secondary">
                        Free over {formatCurrency(50, region?.currency_code || 'usd', getLocaleForCurrency(region?.currency_code || 'usd'))}
                      </p>
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
