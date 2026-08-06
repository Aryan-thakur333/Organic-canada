import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronRight, 
  MapPin, 
  CreditCard, 
  CheckCircle2, 
  ArrowLeft,
  Truck,
  ShieldCheck,
  ShoppingBag,
  AlertCircle,
  Building2,
  AlertTriangle,
  Download,
  Info
} from 'lucide-react';
import B2BPriceBadge from '../components/common/B2BPriceBadge';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/Footer';
import MobileNav from '../components/MobileNav';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import CheckoutStripePanel from '../components/checkout/CheckoutStripePanel';
import CheckoutPaypalPanel from '../components/checkout/CheckoutPaypalPanel';
import useMedusaCart from '../hooks/useMedusaCart';
import useCart from '../hooks/useCart';
import useToast from '../hooks/useToast';
import useB2BCompany from '../hooks/useB2BCompany';
import { 
  setCartGuestDetails, 
  listShippingOptionsForCart, 
  selectShippingOption,
  initiatePaymentSessionForProvider,
  completeCart,
  listPaymentProvidersForRegion,
  ensurePaymentCollection,
  pickStripePaymentProviderId,
  extractStripeClientSecret,
  ensureCustomerAttachedToCart,
  prepareCheckoutCartForUpdate,
  recreateCheckoutCart
} from '../services/medusa/checkoutService';
import { authService } from '../services/medusa/authService';
import { retrieveCart } from '../services/medusa/cartService';
import { getCartStorageKey } from '../services/medusa/cartService';
import { clearCart } from '../redux/cartSlice';
import { addOrder } from '../redux/orderSlice';
import { useRegion } from '../contexts/RegionContext';
import { commerceFeatures } from '../config/commerceFeatures';
import { subscriptionService } from '../services/medusa/subscriptionService';
import { getCheckoutErrorMessage, getCheckoutRegionCountries, normalizeCheckoutPhone, resolveCheckoutCountry, validateCheckoutShippingAddress } from '../lib/medusa/checkout-region';
import { groupCheckoutSummaryItems } from '../lib/medusa/bundle-display';

const DIGITAL_STEPS = [
  { id: 'payment', title: 'Payment', icon: <CreditCard size={20} /> },
  { id: 'confirm', title: 'Confirm', icon: <CheckCircle2 size={20} /> },
];

const PHYSICAL_STEPS = [
  { id: 'shipping', title: 'Shipping', icon: <MapPin size={20} /> },
  { id: 'payment', title: 'Payment', icon: <CreditCard size={20} /> },
  { id: 'confirm', title: 'Confirm', icon: <CheckCircle2 size={20} /> },
];

const Checkout = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    province: '',
    postal_code: '',
    country_code: '',
  });
  const [checkoutCart, setCheckoutCart] = useState(null);
  const [shippingOptions, setShippingOptions] = useState([]);
  const [selectedShippingId, setSelectedShippingId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('stripe'); // stripe, paypal, cod
  const [availableProviders, setAvailableProviders] = useState([]);
  const [clientSecret, setClientSecret] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [finalizationError, setFinalizationError] = useState('');
  const [bundleRebuildRequired, setBundleRebuildRequired] = useState(false);
  const [b2bMethod, setB2bMethod] = useState(false);
  
  const initializationRef = useRef({ cartId: null, running: false, completed: false });
  const completeInFlightRef = useRef(false);
  const completedOrderRef = useRef(null);
  const finalizationPaymentRef = useRef(null);
  const [hasFinalizationPayment, setHasFinalizationPayment] = useState(false);

  const { company: b2bCompany, isLoading: b2bLoading, creditCheck: b2bCreditCheck, refetch: refetchB2BCompany } = useB2BCompany();

  const { items: rawItems, medusaCartId, currencyCode, serverTotals, metadata } = useSelector(state => state.cart);
  const { formatPrice, grandTotal: hookGrandTotal, tax: hookTax, subtotal: hookSubtotal, shipping, couponDiscount } = useCart();
  const { ensureCart, refreshFromServer } = useMedusaCart();
  const { showToast } = useToast();
  const { region, regionSlug, currencyCode: selectedCurrencyCode } = useRegion();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  // Platform fee is now stored natively in metadata and acts as an internal deduction for B2C
  const activeItems = useMemo(() => Array.isArray(rawItems) ? rawItems.filter(i => i.title !== "Platform Fee" && !i.metadata?.is_platform_fee) : [], [rawItems]);
  const checkoutSummaryItems = useMemo(() => groupCheckoutSummaryItems(activeItems), [activeItems]);
  const subscriptionItems = useMemo(() => activeItems.filter((item) => item.metadata?.is_subscription === true), [activeItems]);
  const isSubscriptionCart = commerceFeatures.subscriptions && subscriptionItems.length > 0;
  const hasMixedSubscriptionCart = isSubscriptionCart && subscriptionItems.length !== activeItems.length;
  const platformFeeAmount = metadata?.platform_fee_total || 0;

  const displayGrandTotal = hookGrandTotal || 0;
  const isApprovedB2B = b2bCompany?.status === 'approved' || b2bCompany?.status === 'active';
  
  const cartType = metadata?.cart_type || 'b2c';
  const showB2BPricing = 
    (cartType === 'b2b' || cartType === 'b2b_quote') && 
    isApprovedB2B && 
    metadata?.company_id === b2bCompany?.id;

  const validateCheckoutCartCurrency = useCallback((cart) => {
    const expectedCurrency = String(selectedCurrencyCode || region?.currency_code || '').toLowerCase();
    const cartCurrency = String(cart?.currency_code || '').toLowerCase();
    if (region?.id && cart?.region_id && cart.region_id !== region.id) {
      throw new Error("Your cart belongs to a different region. Please return to your basket.");
    }
    if (expectedCurrency && cartCurrency && cartCurrency !== expectedCurrency) {
      throw new Error(`Your cart currency (${cartCurrency.toUpperCase()}) does not match ${expectedCurrency.toUpperCase()}.`);
    }
    return cart;
  }, [region, selectedCurrencyCode]);

  const regionCountries = useMemo(() => getCheckoutRegionCountries(checkoutCart), [checkoutCart]);
  const updateCheckoutCart = useCallback((cart) => {
    const validated = validateCheckoutCartCurrency(cart);
    setCheckoutCart(validated);
    return validated;
  }, [validateCheckoutCartCurrency]);

  useEffect(() => {
    if (!checkoutCart) return;
    setFormData((current) => ({ ...current, country_code: resolveCheckoutCountry(regionCountries, current.country_code) }));
  }, [checkoutCart, regionCountries]);

  const b2bCreditResult = b2bMethod && showB2BPricing
    ? b2bCreditCheck(displayGrandTotal)
    : { isApproved: true, warning: null };

  // Detect digital items: check metadata on cart items, variant, and product
  const isDigitalItem = (item) => {
    const meta = item?.metadata || {};
    const variantMeta = item?.variant?.metadata || {};
    const productMeta = item?.variant?.product?.metadata || {};
    const productType = item?.variant?.product?.type?.value || '';
    
    return (
      meta?.is_digital === true ||
      meta?.is_digital === 'true' ||
      variantMeta?.is_digital === true ||
      variantMeta?.is_digital === 'true' ||
      productMeta?.is_digital === true ||
      productMeta?.is_digital === 'true' ||
      productType === 'Digital Product'
    );
  };

  const isDigitalOnlyCart = useMemo(() => {
    return activeItems.length > 0 && activeItems.every(isDigitalItem);
  }, [activeItems]);

  const isMixedCart = useMemo(() => {
    return activeItems.some(isDigitalItem) && activeItems.some(item => !isDigitalItem(item));
  }, [activeItems]);

  // Use different steps based on cart type
  const steps = isDigitalOnlyCart ? DIGITAL_STEPS : PHYSICAL_STEPS;
  // For digital-only carts, start at step 0 (payment)
  const initialStep = isDigitalOnlyCart ? 0 : 0;

  useEffect(() => {
    async function initializeCheckout() {
      const mode = metadata?.cart_type || 'b2c';
      const cartId =
        localStorage.getItem(getCartStorageKey(mode, region?.id || "")) ||
        (region?.id && medusaCartId ? medusaCartId : null);

      if (!cartId) {
        navigate('/cart', { replace: true });
        return;
      }

      if (
        initializationRef.current.running ||
        (initializationRef.current.completed && initializationRef.current.cartId === cartId)
      ) {
        return;
      }

      initializationRef.current.running = true;
      initializationRef.current.cartId = cartId;

      try {
        let { cart: currentCart } = await retrieveCart(cartId);
        updateCheckoutCart(currentCart);

        if (mode === 'b2c' && currentCart?.metadata?.cart_type !== 'b2c') {
          console.warn("[Checkout] Cart type mismatch, creating new B2C cart");
          let customerId = null;
          try {
            const profileData = await authService.getCurrentCustomer();
            customerId = profileData?.customer;
          } catch (e) {
            console.warn("[Checkout] Cart type mismatch check: guest customer resolved.");
          }
          
          currentCart = await recreateCheckoutCart(currentCart, customerId);
        }

        await refreshFromServer(currentCart.id);
        const { cart: refreshedCart } = await retrieveCart(currentCart.id);
        updateCheckoutCart(refreshedCart);
        initializationRef.current.completed = true;
      } catch (err) {
        console.error("[Checkout] Initial setup failed:", err);
        navigate('/cart', { replace: true });
      } finally {
        initializationRef.current.running = false;
      }
    }

    initializeCheckout();
  }, [navigate, refreshFromServer, metadata?.cart_type, region?.id, medusaCartId, updateCheckoutCart]);

  useEffect(() => {
    if (activeItems.length === 0) {
      navigate('/cart');
    }
  }, [activeItems, navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSetupCheckout = async (email_override) => {
    const ensuredCart = medusaCartId ? null : await ensureCart();
    let cartId = medusaCartId || ensuredCart?.id;
    if (!cartId) throw new Error("Cart not ready.");
    
    // Phase 5: Prepare cart (stale payment reset)
    let cartToUpdate;
    try {
      const retrieved = await retrieveCart(cartId);
      cartToUpdate = validateCheckoutCartCurrency(retrieved.cart);
      cartToUpdate = await prepareCheckoutCartForUpdate(cartToUpdate);
      cartId = cartToUpdate.id; // It might be a new cart ID after recreation
    } catch(err) {
      throw new Error("Could not prepare cart for update. Please refresh.");
    }

    let customerData = null;
    try {
      const profileData = await authService.getCurrentCustomer();
      customerData = profileData?.customer;
    } catch (e) {
      console.warn("[Checkout] No authenticated customer found; proceeding as guest.");
    }

    if (customerData) {
      await ensureCustomerAttachedToCart({ cart: cartToUpdate, customer: customerData });
    }

    // For digital-only carts, set minimal details
    if (isDigitalOnlyCart && email_override) {
      await setCartGuestDetails(cartId, {
        email: email_override,
        firstName: formData.first_name || 'Digital',
        lastName: formData.last_name || 'Customer',
        phone: formData.phone || '',
        addressText: 'Digital Download, Online'
      });
    }

    await refreshFromServer(cartId);
    
    const { cart: retrievedCart } = await retrieveCart(cartId);
    const cart = validateCheckoutCartCurrency(retrievedCart);
    const providers = await listPaymentProvidersForRegion(cart.region_id, cart.id);
    const providerIds = providers.map(p => typeof p === 'string' ? p : p.id);
    setAvailableProviders(providerIds);
    
    if (pickStripePaymentProviderId(providers)) {
      setPaymentMethod('stripe');
    } else if (providerIds.some((id) => id === 'paypal' || id.includes('paypal'))) {
      setPaymentMethod('paypal');
    } else {
      setPaymentMethod('cod');
    }

    return { cart, providers, providerIds, cartId };
  };

  const nextStep = async () => {
    if (currentStep === 0) {
      if (isDigitalOnlyCart) {
        // Digital-only: validate email only, no shipping needed
        if (!formData.email) {
          showToast("Please provide your email address", "error");
          return;
        }
        setIsProcessing(true);
        try {
          const { providers, providerIds } = await handleSetupCheckout(formData.email);
          setCurrentStep(1);
        } catch (error) {
          showToast(error.message || "Failed to setup checkout", "error");
        } finally {
          setIsProcessing(false);
        }
      } else {
        // Physical or Mixed: validate full shipping
        setIsProcessing(true);
        try {
          const ensuredCart = medusaCartId ? null : await ensureCart();
          let cartId = medusaCartId || ensuredCart?.id;
          if (!cartId) throw new Error("Cart not ready.");
          
          let cartToUpdate;
          try {
            const retrieved = await retrieveCart(cartId);
            cartToUpdate = validateCheckoutCartCurrency(retrieved.cart);
            cartToUpdate = await prepareCheckoutCartForUpdate(cartToUpdate);
            cartId = cartToUpdate.id;
            const prepared = await retrieveCart(cartId);
            cartToUpdate = validateCheckoutCartCurrency(prepared.cart);
            updateCheckoutCart(cartToUpdate);
          } catch(err) {
            throw new Error("Could not prepare cart for update. Please refresh.");
          }

          const addressValidation = validateCheckoutShippingAddress(formData, getCheckoutRegionCountries(cartToUpdate));
          if (!addressValidation.valid) {
            const validationError = new Error(addressValidation.message);
            validationError.code = addressValidation.code;
            throw validationError;
          }
          
          let customerData = null;
          try {
            const profileData = await authService.getCurrentCustomer();
            customerData = profileData?.customer;
          } catch (e) {
            console.warn("[Checkout] No authenticated customer found; proceeding as guest.");
          }

          if (customerData) {
            await ensureCustomerAttachedToCart({ cart: cartToUpdate, customer: customerData });
          }

          const addressUpdate = await setCartGuestDetails(cartId, {
            email: formData.email,
            firstName: formData.first_name,
            lastName: formData.last_name,
            phone: normalizeCheckoutPhone(formData.phone),
            address1: formData.address,
            city: formData.city,
            province: formData.province,
            postalCode: formData.postal_code,
            countryCode: addressValidation.country_code,
          });
          const addressUpdatedCart = addressUpdate?.cart || addressUpdate?.data?.cart;
          if (!addressUpdatedCart?.id) throw new Error("Shipping address update was not confirmed by the cart service.");
          updateCheckoutCart(addressUpdatedCart);

          const options = await listShippingOptionsForCart(cartId);
          setShippingOptions(options);
          if (!options.length) throw new Error("No shipping option is available for this address.");
          setSelectedShippingId(options[0].id);
          const shippingResult = await selectShippingOption(cartId, options[0].id);
          await ensurePaymentCollection(shippingResult?.cart || shippingResult?.data?.cart || { id: cartId });
          
          await refreshFromServer(cartId);
          
          const { cart: retrievedCart } = await retrieveCart(cartId);
          const cart = updateCheckoutCart(retrievedCart);
          const providers = await listPaymentProvidersForRegion(cart.region_id, cart.id);
          const providerIds = providers.map(p => typeof p === 'string' ? p : p.id);
          setAvailableProviders(providerIds);
          
          if (pickStripePaymentProviderId(providers)) {
            setPaymentMethod('stripe');
          } else if (providerIds.some((id) => id === 'paypal' || id.includes('paypal'))) {
            setPaymentMethod('paypal');
          } else {
            setPaymentMethod('cod');
          }

          setCurrentStep(1);
        } catch (error) {
          const regionName = region?.name || (regionSlug === 'usa' ? 'USA' : regionSlug === 'canada' ? 'Canada' : 'selected');
          showToast(getCheckoutErrorMessage(error, regionName), "error");
        } finally {
          setIsProcessing(false);
        }
      }
    } else if (currentStep === 1) {
      if (isSubscriptionCart) {
        if (hasMixedSubscriptionCart) {
          showToast("Subscription checkout cannot be mixed with one-time items.", "error");
          return;
        }
        const intervals = [...new Set(subscriptionItems.map((item) => String(item.metadata?.subscription_interval || '').toUpperCase()))];
        const counts = [...new Set(subscriptionItems.map((item) => Number(item.metadata?.subscription_interval_count || 1)))];
        if (intervals.length !== 1 || counts.length !== 1 || !intervals[0]) {
          showToast("All subscription items must use the same delivery interval.", "error");
          return;
        }
        setIsProcessing(true);
        try {
          const storageKey = `subscription_idempotency_${medusaCartId}`;
          let idempotencyKey = sessionStorage.getItem(storageKey);
          if (!idempotencyKey) {
            idempotencyKey = `storefront:${crypto.randomUUID()}`;
            sessionStorage.setItem(storageKey, idempotencyKey);
          }
          const result = await subscriptionService.create({
            cart_id: medusaCartId,
            interval: intervals[0],
            interval_count: counts[0],
            idempotency_key: idempotencyKey,
          });
          if (!result?.checkout_url) throw new Error("Subscription checkout URL was not returned.");
          window.location.assign(result.checkout_url);
        } catch (error) {
          showToast(error?.response?.data?.message || error?.message || "Unable to start subscription checkout.", "error");
        } finally {
          setIsProcessing(false);
        }
        return;
      }
      if (paymentMethod === 'stripe') {
        setIsProcessing(true);
        try {
          const { cart: retrievedCart } = await retrieveCart(medusaCartId);
          const cart = validateCheckoutCartCurrency(retrievedCart);
          const providers = await listPaymentProvidersForRegion(cart.region_id, cart.id);
          const stripePid = pickStripePaymentProviderId(providers);
          if (!stripePid) throw new Error("Stripe not available");
          
          await initiatePaymentSessionForProvider(cart, stripePid);
          const { cart: updatedCartRaw } = await retrieveCart(medusaCartId);
          const updatedCart = validateCheckoutCartCurrency(updatedCartRaw);
          const secret = extractStripeClientSecret(updatedCart);
          
          if (!secret) {
            throw new Error("Could not retrieve Stripe client secret.");
          }
          setClientSecret(secret);
          setCurrentStep(2);
        } catch (error) {
          console.error("[Checkout] Stripe init failed:", error);
          showToast(error.message || "Failed to initialize payment", "error");
        } finally {
          setIsProcessing(false);
        }
      } else if (paymentMethod === 'paypal') {
        setIsProcessing(true);
        try {
          const { cart: retrievedCart } = await retrieveCart(medusaCartId);
          const cart = validateCheckoutCartCurrency(retrievedCart);
          const paypalProviderId = availableProviders.find((id) => id === 'paypal' || id.includes('paypal'));
          if (!paypalProviderId) throw new Error("PayPal not available");
          await initiatePaymentSessionForProvider(cart, paypalProviderId);
          
          setCurrentStep(2);
        } catch (error) {
          console.error("[Checkout] PayPal init failed:", error);
          showToast(error.message || "Failed to initialize PayPal payment", "error");
        } finally {
          setIsProcessing(false);
        }
      } else {
        setCurrentStep(2);
      }
    }
  };

  const handlePaidSuccess = async (paymentData) => {
    if (completedOrderRef.current) {
      console.log("[Checkout] Order already completed:", completedOrderRef.current.id);
      return completedOrderRef.current;
    }

    if (completeInFlightRef.current) {
      console.log("[Checkout] Completion already in flight, ignoring duplicate call");
      return;
    }

    completeInFlightRef.current = true;
    setIsProcessing(true);
    try {
      const retainedPayment = finalizationPaymentRef.current;
      const normalizedPayment = retainedPayment || (paymentMethod === 'cod' ? { method: 'cod' } : (() => {
        if (!paymentData) return { method: 'stripe', provider_id: 'pp_stripe_stripe' };
        return {
          method: paymentData.method || paymentData.payment_method || 'stripe',
          provider_id: paymentData.provider_id || 'pp_stripe_stripe',
          payment_intent_id: paymentData.payment_intent_id || paymentData.id || null,
          payment_status: paymentData.payment_status || paymentData.status || null,
        };
      })());
      finalizationPaymentRef.current = normalizedPayment;
      setHasFinalizationPayment(true);
      setFinalizationError('');
      setBundleRebuildRequired(false);

      console.log(`[Checkout] Starting order completion for method: ${normalizedPayment.method}`);

      if (normalizedPayment.method === 'stripe' || normalizedPayment.method === 'paypal') {
        sessionStorage.setItem(
          `paid_cart_${medusaCartId}`,
          JSON.stringify({
            cart_id: medusaCartId,
            payment_intent_id: normalizedPayment.payment_intent_id,
            provider_id: normalizedPayment.provider_id,
            status: "succeeded",
          })
        );
      }
      
      if (paymentMethod === 'cod' && !retainedPayment) {
        console.log("[Checkout][COD] Retrieving cart before session init:", medusaCartId);
        const { cart: retrievedCart } = await retrieveCart(medusaCartId);
        const cart = validateCheckoutCartCurrency(retrievedCart);

        console.log("[Checkout][COD] Initializing system payment session with provider: pp_system_default");
        const sessionResult = await initiatePaymentSessionForProvider(cart, 'pp_system_default');
        console.log("[Checkout][COD] System payment session attached:", sessionResult);
      }

      console.log(`[Checkout] Calling backend completeCart endpoint for cart ID: ${medusaCartId}...`);
      const result = await completeCart(medusaCartId);
      console.log("[Checkout] Backend Complete Cart Result:", result);

      const order = result?.order || result?.data?.order || (result?.type === 'order' ? result.data : null) || result;

      if (order && order.id) {
        console.log("[Checkout] Order created:", {
          customerId: order.customer_id,
          cartId: medusaCartId,
          orderId: order.id,
          salesChannelId: order.sales_channel_id,
        });

        if (!order.customer_id && order.id) {
          const existing = JSON.parse(localStorage.getItem('organic_guest_order_ids') || '[]');
          localStorage.setItem(
            'organic_guest_order_ids',
            JSON.stringify([...new Set([...existing, order.id])].slice(-20))
          );
        }

        completedOrderRef.current = order;
        finalizationPaymentRef.current = null;
        setHasFinalizationPayment(false);
        setFinalizationError('');
        
        dispatch(clearCart());
        dispatch(addOrder(order));
        
        const completedMode = metadata?.cart_type || 'b2c';
        if (region?.id) {
          localStorage.removeItem(getCartStorageKey(completedMode, region.id));
        }
        localStorage.removeItem('cart_id');
        localStorage.removeItem('b2b_cart_id');
        localStorage.removeItem('b2b_quote_cart_id');
        sessionStorage.removeItem(`paid_cart_${medusaCartId}`);

        showToast("Order placed successfully!", "success");

        console.log("[Checkout] Performing post-checkout session re-validation...");
        await new Promise(resolve => setTimeout(resolve, 500));
        
        try {
          await refetchB2BCompany();
          console.log("[Checkout] Post-checkout B2B session re-validation successful");
        } catch (revalidationError) {
          console.warn("[Checkout] Post-checkout session re-validation failed:", revalidationError);
        }

        navigate('/order-success');
        return result.order;
      }
    } catch (error) {
      console.error("[Checkout] Failed to finalize order:", error);
      const code = error?.response?.data?.code;
      const message = error?.response?.data?.message || error?.message || 'Order finalization is still pending.';
      setFinalizationError(message);
      if (code === 'BUNDLE_CART_REBUILD_REQUIRED') {
        setBundleRebuildRequired(true);
        showToast("Your cart changed after payment setup. Rebuild the cart before continuing.", "error");
      } else {
        showToast("Payment setup is complete. Retry order finalization.", "error");
      }
    } finally {
      completeInFlightRef.current = false;
      setIsProcessing(false);
    }
  };

  const handleRebuildBundleCart = async () => {
    if (isProcessing || !medusaCartId) return;
    setIsProcessing(true);
    try {
      const { cart: oldCart } = await retrieveCart(medusaCartId);
      const rebuiltCart = await recreateCheckoutCart(oldCart);
      await refreshFromServer(rebuiltCart.id);
      const { cart: refreshedCart } = await retrieveCart(rebuiltCart.id);
      updateCheckoutCart(refreshedCart);
      sessionStorage.removeItem(`paid_cart_${medusaCartId}`);
      finalizationPaymentRef.current = null;
      setHasFinalizationPayment(false);
      setFinalizationError('');
      setBundleRebuildRequired(false);
      setClientSecret('');
      setCurrentStep(0);
      showToast("Bundle cart rebuilt with current pricing. Set up payment for the new cart.", "success");
    } catch (error) {
      showToast(error?.response?.data?.message || error?.message || "Could not rebuild the bundle cart.", "error");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <Navbar />
      
      <main className="pt-32 pb-20 container-custom">
        <div className="grid lg:grid-cols-3 gap-12 items-start">
          
          {/* Main Checkout Flow */}
          <div className="lg:col-span-2 flex flex-col gap-8">
            {/* Step Progress - adapts for digital-only */}
            <div className="flex items-center justify-between bg-white p-6 rounded-[2rem] shadow-sm border border-gray-200">
              {isDigitalOnlyCart && (
                <div className="flex items-center gap-3 px-3 py-2 bg-blue-50 rounded-2xl border border-blue-100 mr-auto">
                  <Download size={16} className="text-blue-500" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">Digital Download</span>
                </div>
              )}
              {steps.map((step, i) => (
                <div key={step.id} className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    currentStep >= i ? 'bg-accent-primary text-white scale-110 shadow-lg' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {currentStep > i ? <CheckCircle2 size={18} /> : step.icon}
                  </div>
                  <span className={`text-sm font-bold hidden sm:block ${currentStep >= i ? 'text-gray-900' : 'text-gray-400'}`}>
                    {step.title}
                  </span>
                  {i < steps.length - 1 && <ChevronRight size={16} className="text-gray-300 hidden sm:block" />}
                </div>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {currentStep === 0 && (
                <motion.div
                  key={isDigitalOnlyCart ? 'digital-info' : 'shipping'}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="bg-white p-8 rounded-[2.5rem] shadow-premium border border-gray-200 flex flex-col gap-6"
                >
                  {isDigitalOnlyCart ? (
                    <>
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-16 h-16 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                          <Download size={32} />
                        </div>
                        <div>
                          <h2 className="text-2xl font-black mb-1 text-gray-900">Digital Download</h2>
                          <p className="text-sm text-gray-500">
                            This order contains only digital products — no shipping required.
                          </p>
                        </div>
                      </div>
                      <div className="p-5 rounded-2xl bg-blue-50 border border-blue-100">
                        <div className="flex items-start gap-3">
                          <Info size={18} className="text-blue-500 shrink-0 mt-0.5" />
                          <div className="text-sm text-blue-800">
                            <p className="font-bold mb-1">What happens next?</p>
                            <p className="text-blue-700">
                              After payment, you'll receive immediate access to download your files.
                              You can also find them anytime in your <strong>Orders</strong> or <strong>My Downloads</strong> page.
                            </p>
                          </div>
                        </div>
                      </div>
                      <Input label="Email Address" name="email" type="email" value={formData.email} onChange={handleChange} placeholder="john@example.com" required />
                      <div className="grid sm:grid-cols-2 gap-5">
                        <Input label="First Name" name="first_name" value={formData.first_name} onChange={handleChange} placeholder="John" />
                        <Input label="Last Name" name="last_name" value={formData.last_name} onChange={handleChange} placeholder="Doe" />
                      </div>
                      <Button size="lg" className="mt-2 gap-2" onClick={nextStep} isLoading={isProcessing}>
                        Continue to Payment <ChevronRight size={18} />
                      </Button>
                    </>
                  ) : (
                    <>
                      <h2 className="text-2xl font-black mb-2 text-gray-900">
                        Shipping Information
                        {isMixedCart && <span className="text-xs font-bold text-blue-500 ml-3 normal-case">(Physical items only)</span>}
                      </h2>
                      <div className="grid sm:grid-cols-2 gap-5">
                        <Input label="First Name" name="first_name" value={formData.first_name} onChange={handleChange} placeholder="John" />
                        <Input label="Last Name" name="last_name" value={formData.last_name} onChange={handleChange} placeholder="Doe" />
                      </div>
                      <Input label="Email Address" name="email" type="email" value={formData.email} onChange={handleChange} placeholder="john@example.com" />
                      <Input label="Phone Number" name="phone" value={formData.phone} onChange={handleChange} placeholder="+1 (555) 000-0000" />
                      <Input label="Street Address" name="address" value={formData.address} onChange={handleChange} placeholder="123 Farm Lane" />
                      <div className="grid sm:grid-cols-2 gap-5">
                        <Input label="City" name="city" value={formData.city} onChange={handleChange} placeholder="Eco City" />
                        <Input label="State / Province" name="province" value={formData.province} onChange={handleChange} placeholder="State or province" />
                      </div>
                      <div className="grid sm:grid-cols-2 gap-5">
                        <Input label="Postal Code" name="postal_code" value={formData.postal_code} onChange={handleChange} placeholder="12345" />
                        <label className="flex flex-col gap-2 text-sm font-bold text-gray-700">
                          Shipping Country
                          <select name="country_code" value={formData.country_code} onChange={handleChange} disabled={regionCountries.length === 0} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-accent-primary disabled:cursor-not-allowed disabled:bg-gray-100">
                            <option value="">{regionCountries.length ? 'Select shipping country' : 'Shipping countries are not configured'}</option>
                            {regionCountries.map((country) => <option key={country.iso_2} value={country.iso_2}>{country.display_name}</option>)}
                          </select>
                        </label>
                      </div>
                      {isMixedCart && (
                        <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-start gap-3">
                          <Info size={16} className="text-indigo-500 shrink-0 mt-0.5" />
                          <p className="text-xs text-indigo-700 font-medium">
                            Your cart contains both physical and digital items.
                            Shipping address is only needed for physical products.
                            Digital items will be available for download after payment.
                          </p>
                        </div>
                      )}
                      <Button size="lg" className="mt-4 gap-2" onClick={nextStep} isLoading={isProcessing}>
                        Continue to Payment <ChevronRight size={18} />
                      </Button>
                    </>
                  )}
                </motion.div>
              )}

              {currentStep === 1 && (
                <motion.div
                  key="payment-method"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="bg-white p-8 rounded-[2.5rem] shadow-premium border border-gray-200 flex flex-col gap-6"
                >
                  <button onClick={() => setCurrentStep(0)} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-accent-primary transition-colors">
                    <ArrowLeft size={14} /> Back to Shipping
                  </button>
                  <h2 className="text-2xl font-black mb-2 text-gray-900">Payment Method</h2>
                  
                  <div className="flex flex-col gap-4">
                    {/* 1. Stripe */}
                    {(availableProviders.includes('pp_stripe_stripe') || availableProviders.includes('stripe')) && (
                    <label className={`flex items-center gap-4 p-6 rounded-3xl border-2 transition-all cursor-pointer ${
                      paymentMethod === 'stripe' ? 'border-accent-primary bg-accent-primary/5' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <input type="radio" name="payment" checked={paymentMethod === 'stripe'} onChange={() => { setPaymentMethod('stripe'); setB2bMethod(false); }} className="accent-accent-primary w-5 h-5" />
                      <div className="flex-1">
                        <p className="font-bold text-gray-900">{isSubscriptionCart ? 'Recurring card payment' : 'Credit / Debit Card'}</p>
                        <p className="text-xs text-gray-500">{isSubscriptionCart ? 'Secure recurring billing powered by Stripe' : 'Secure payment powered by Stripe'}</p>
                      </div>
                      <CreditCard size={24} className={paymentMethod === 'stripe' ? 'text-accent-primary' : 'text-stone-300'} />
                    </label>
                    )}

                    {/* 2. PayPal */}
                    {!isSubscriptionCart && availableProviders.some((id) => id === 'paypal' || id.includes('paypal')) && (
                    <label className={`flex items-center gap-4 p-6 rounded-3xl border-2 transition-all cursor-pointer ${
                      paymentMethod === 'paypal' ? 'border-accent-primary bg-accent-primary/5' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <input type="radio" name="payment" checked={paymentMethod === 'paypal'} onChange={() => { setPaymentMethod('paypal'); setB2bMethod(false); }} className="accent-accent-primary w-5 h-5" />
                      <div className="flex-1">
                        <p className="font-bold text-gray-900">PayPal</p>
                        <p className="text-xs text-gray-500">Fast and secure checkout with PayPal</p>
                      </div>
                      <CreditCard size={24} className={paymentMethod === 'paypal' ? 'text-accent-primary' : 'text-stone-300'} />
                    </label>
                    )}

                    {/* 3. Cash on Delivery — hidden for digital-only carts */}
                    {!isSubscriptionCart && !isDigitalOnlyCart && availableProviders.some((id) => id === 'pp_system_default' || id === 'manual' || id.includes('system')) && (
                    <label className={`flex items-center gap-4 p-6 rounded-3xl border-2 transition-all cursor-pointer ${
                      paymentMethod === 'cod' ? 'border-accent-primary bg-accent-primary/5' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <input type="radio" name="payment" checked={paymentMethod === 'cod'} onChange={() => { setPaymentMethod('cod'); setB2bMethod(false); }} className="accent-accent-primary w-5 h-5" />
                      <div className="flex-1">
                        <p className="font-bold text-gray-900">Cash on Delivery</p>
                        <p className="text-xs text-gray-500">Pay when you receive your order</p>
                      </div>
                      <ShoppingBag size={24} className={paymentMethod === 'cod' ? 'text-accent-primary' : 'text-stone-300'} />
                    </label>
                    )}

                    {/* 4. B2B Corporate Credit (shown only if user has an active company) */}
                    {!b2bLoading && showB2BPricing && (
                      <label className={`flex items-center gap-4 p-6 rounded-3xl border-2 transition-all cursor-pointer ${
                        b2bMethod ? 'border-accent-primary bg-accent-primary/5' : 'border-gray-200 hover:border-gray-300'
                      }`}>
                        <input type="radio" name="payment" checked={b2bMethod} onChange={() => { setPaymentMethod('b2b_credit'); setB2bMethod(true); }} className="accent-accent-primary w-5 h-5" />
                        <div className="flex-1">
                          <p className="font-bold text-gray-900">Corporate Credit Account</p>
                          <p className="text-xs text-gray-500">
                            {b2bCompany.company_name} — 
                            Credit: {(b2bCompany.credit_limit / 100).toLocaleString(undefined, { style: 'currency', currency: (currencyCode || selectedCurrencyCode || 'usd').toUpperCase() })}
                          </p>
                        </div>
                        <Building2 size={24} className={b2bMethod ? 'text-accent-primary' : 'text-stone-300'} />
                      </label>
                    )}
                  </div>

                  <Button size="lg" className="mt-4 gap-2" onClick={nextStep} isLoading={isProcessing}>
                    Confirm Method <ChevronRight size={18} />
                  </Button>
                </motion.div>
              )}

              {currentStep === 2 && (
                <motion.div
                  key="confirm"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="bg-white p-8 rounded-[2.5rem] shadow-premium border border-gray-200 flex flex-col gap-6"
                >
                  <button onClick={() => setCurrentStep(1)} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-accent-primary transition-colors">
                    <ArrowLeft size={14} /> Back to Method
                  </button>
                  <h2 className="text-2xl font-black mb-2 text-gray-900">Final Confirmation</h2>
                  {bundleRebuildRequired ? (
                    <div className="rounded-2xl border border-red-300 bg-red-50 p-5 text-red-950" role="alert">
                      <p className="font-bold">Your cart changed after payment setup. Rebuild the cart before continuing.</p>
                      <p className="mt-1 text-sm">{finalizationError}</p>
                      <Button size="sm" className="mt-4" onClick={handleRebuildBundleCart} isLoading={isProcessing}>
                        Rebuild Bundle Cart
                      </Button>
                    </div>
                  ) : finalizationError && hasFinalizationPayment && (
                    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950" role="alert">
                      <p className="font-bold">Payment is complete. Your order still needs finalization.</p>
                      <p className="mt-1 text-sm">{finalizationError}</p>
                      <Button size="sm" className="mt-4" onClick={() => handlePaidSuccess(finalizationPaymentRef.current)} isLoading={isProcessing}>
                        Retry Finalize Order
                      </Button>
                    </div>
                  )}
                  
                  {paymentMethod === 'stripe' ? (
                    clientSecret ? (
                      <CheckoutStripePanel 
                        amountCents={Math.round(displayGrandTotal * 100)}
                        currency={currencyCode || 'usd'}
                        clientSecret={clientSecret}
                        customerDetails={{
                          name: `${formData.first_name} ${formData.last_name}`,
                          email: formData.email,
                          phone: formData.phone,
                          address: `${formData.address}, ${formData.city}`,
                        }}
                        onPaidSuccess={handlePaidSuccess}
                      />
                    ) : (
                      <div className="p-8 rounded-[2rem] bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 text-center">
                        <AlertCircle className="mx-auto mb-4 text-red-500" size={40} />
                        <h3 className="text-lg font-black text-red-600 mb-2">Payment Session Failed</h3>
                        <p className="text-sm text-red-500/80 mb-6">We couldn't initialize the secure payment session. This usually happens if Stripe is not correctly configured in the backend.</p>
                        {sessionStorage.getItem(`paid_cart_${medusaCartId}`) ? (
                          <div className="flex flex-col gap-3">
                            <p className="text-xs font-bold text-red-600 uppercase">Payment succeeded, but order finalization needs to be retried.</p>
                            <Button 
                              size="sm" 
                              onClick={() => {
                                const stored = JSON.parse(sessionStorage.getItem(`paid_cart_${medusaCartId}`));
                                handlePaidSuccess({ 
                                  method: 'stripe', 
                                  payment_intent_id: stored.payment_intent_id,
                                  provider_id: stored.provider_id
                                });
                              }}
                              isLoading={isProcessing}
                            >
                              Retry Finalize Order
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setCurrentStep(1)}>
                            Try Again or Change Method
                          </Button>
                        )}
                      </div>
                    )
                  ) : paymentMethod === 'paypal' ? (
                    <CheckoutPaypalPanel 
                      amountCents={Math.round(displayGrandTotal * 100)}
                      currency={currencyCode || 'usd'}
                      onPaidSuccess={handlePaidSuccess}
                    />
                  ) : b2bMethod ? (
                    <div className="flex flex-col gap-6">
                      {/* Credit check warning banner */}
                      {!b2bCreditResult.isApproved && (
                        <div className="p-5 rounded-3xl bg-red-50 border border-red-200 flex items-start gap-4">
                          <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={22} />
                          <div>
                            <p className="font-bold text-red-700 mb-1">Insufficient Corporate Credit</p>
                            <p className="text-sm text-red-600">{b2bCreditResult.warning}</p>
                            <div className="mt-3 flex gap-6 text-sm text-red-600">
                              <span>Credit Limit: <strong className="text-red-700">
                                {(b2bCompany?.credit_limit / 100).toLocaleString(undefined, { style: 'currency', currency: (currencyCode || selectedCurrencyCode || 'usd').toUpperCase() })}
                              </strong></span>
                              <span>Order Total: <strong className="text-red-700">
                                {formatPrice(displayGrandTotal)}
                              </strong></span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Approved credit info */}
                      {b2bCreditResult.isApproved && (
                        <div className="p-6 rounded-3xl bg-emerald-50 border border-emerald-200 flex items-start gap-4">
                          <Building2 className="text-emerald-600 shrink-0 mt-0.5" size={22} />
                          <div>
                            <p className="font-bold text-emerald-700 mb-1">
                              Charging to {b2bCompany?.company_name}
                            </p>
                            <p className="text-sm text-emerald-600">
                              Credit Remaining: <strong>
                                {b2bCreditResult.remainingCredit.toLocaleString(undefined, { style: 'currency', currency: (currencyCode || selectedCurrencyCode || 'usd').toUpperCase() })}
                              </strong>
                            </p>
                          </div>
                        </div>
                      )}

                      <Button
                        size="lg"
                        onClick={() => handlePaidSuccess({ method: 'b2b_credit' })}
                        isLoading={isProcessing}
                        disabled={!b2bCreditResult.isApproved}
                        className={!b2bCreditResult.isApproved ? 'opacity-50 cursor-not-allowed' : ''}
                      >
                        {b2bCreditResult.isApproved
                          ? `Place Order with Corporate Credit`
                          : 'Insufficient Credit — Contact Admin'}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-6">
                      <div className="p-6 rounded-3xl bg-accent-primary/5 border border-accent-primary/20 text-center">
                        <p className="font-bold text-accent-primary mb-2">Ready to place order?</p>
                        <p className="text-sm text-text-secondary">You will pay {formatPrice(displayGrandTotal)} in cash upon delivery.</p>
                      </div>
                      <Button size="lg" onClick={() => handlePaidSuccess({ method: 'cod' })} isLoading={isProcessing}>
                        Place Order Now
                      </Button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Sidebar Summary */}
          <div className="sticky top-32 flex flex-col gap-6">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-premium border border-gray-200">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-black text-gray-900">Your Order</h3>
                {showB2BPricing && <B2BPriceBadge compact />}
              </div>
              {showB2BPricing && (
                <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold text-emerald-700">
                  B2B Wholesale Pricing Applied for {b2bCompany.company_name}
                </div>
              )}
              <div className="flex flex-col gap-4 mb-6 max-h-60 overflow-y-auto pr-2 scrollbar-hide">
                {checkoutSummaryItems.map(summary => summary.kind === 'bundle' ? (
                  <div key={summary.id} className="flex justify-between items-start gap-4">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{summary.title}</p>
                      <p className="text-xs text-gray-500">Bundle × {summary.quantity}</p>
                      <ul className="mt-1 space-y-0.5 text-xs text-gray-500">
                        {summary.components.map((component, index) => (
                          <li key={`${component.title}-${index}`}>{component.title} × {component.quantity}</li>
                        ))}
                      </ul>
                    </div>
                    <span className="text-sm font-black text-gray-900">{formatPrice(summary.total)}</span>
                  </div>
                ) : (
                  <div key={summary.item.id} className="flex justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                      {summary.item.image && <img src={summary.item.image} className="w-12 h-12 rounded-xl object-cover" alt={summary.item.title} />}
                      <div>
                        <p className="text-sm font-bold line-clamp-1 text-gray-900">{summary.item.title || "Product"}</p>
                        <p className="text-xs text-gray-500">Qty: {summary.item.quantity}</p>
                        {showB2BPricing && <B2BPriceBadge compact />}
                      </div>
                    </div>
                    <span className="text-sm font-black text-gray-900">{formatPrice(summary.item.price * summary.item.quantity)}</span>
                  </div>
                ))}
                {activeItems.length === 0 && <p className="text-sm text-text-secondary italic">No items found</p>}
              </div>
              
              <div className="flex flex-col gap-3 border-t border-gray-200 pt-6">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 font-medium">Subtotal</span>
                  <span className="font-bold text-gray-900">{formatPrice(hookSubtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 font-medium">Tax (5%)</span>
                  <span className="font-bold text-gray-900">{formatPrice(hookTax)}</span>
                </div>
                {shipping > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 font-medium">Shipping</span>
                    <span className="font-bold text-gray-900">{formatPrice(shipping)}</span>
                  </div>
                )}
                {couponDiscount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-accent-primary font-bold">Discount</span>
                    <span className="text-accent-primary font-bold">-{formatPrice(couponDiscount)}</span>
                  </div>
                )}

                <div className="flex justify-between items-center pt-3 mt-3 border-t border-gray-200">
                  <span className="text-lg font-black text-gray-900">Total</span>
                  <span className="text-2xl font-black text-accent-primary">{formatPrice(displayGrandTotal)}</span>
                </div>
              </div>
            </div>

            {/* Trust Badges */}
            <div className="flex flex-col gap-4 px-4">
              <div className="flex items-center gap-3">
                <Truck size={18} className="text-accent-primary" />
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Free shipping on all orders</p>
              </div>
              <div className="flex items-center gap-3">
                <ShieldCheck size={18} className="text-accent-primary" />
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Secure 256-bit SSL encryption</p>
              </div>
            </div>
          </div>

        </div>
      </main>

      <Footer />
      <MobileNav />
    </div>
  );
};

export default Checkout;
