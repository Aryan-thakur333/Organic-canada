import React, { useState, useEffect, useMemo } from 'react';
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
  pickStripePaymentProviderId,
  extractStripeClientSecret,
  assignCustomerToCart
} from '../services/medusa/checkoutService';
import { authService } from '../services/medusa/authService';
import { retrieveCart } from '../services/medusa/cartService';
import { clearCart } from '../redux/cartSlice';
import { addOrder } from '../redux/orderSlice';

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
    postal_code: '',
  });
  const [shippingOptions, setShippingOptions] = useState([]);
  const [selectedShippingId, setSelectedShippingId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('stripe'); // stripe, paypal, cod
  const [availableProviders, setAvailableProviders] = useState([]);
  const [clientSecret, setClientSecret] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [b2bMethod, setB2bMethod] = useState(false);

  const { company: b2bCompany, isLoading: b2bLoading, creditCheck: b2bCreditCheck } = useB2BCompany();
  const b2bCreditResult = b2bMethod && b2bCompany
    ? b2bCreditCheck(displayGrandTotal)
    : { isApproved: true, warning: null };

  const { items: rawItems, medusaCartId, currencyCode, serverTotals } = useSelector(state => state.cart);
  const { formatPrice, grandTotal: hookGrandTotal, tax: hookTax, subtotal: hookSubtotal, shipping, couponDiscount } = useCart();
  const { ensureCart, refreshFromServer } = useMedusaCart();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const activeItems = useMemo(() => Array.isArray(rawItems) ? rawItems : [], [rawItems]);
  const displayGrandTotal = hookGrandTotal || 0;

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
    if (medusaCartId) {
      console.log("[Checkout] Refreshing cart on mount:", medusaCartId);
      refreshFromServer(medusaCartId).catch(err => console.error("[Checkout] Initial refresh failed:", err));
    }
  }, [medusaCartId, refreshFromServer]);

  useEffect(() => {
    if (activeItems.length === 0) {
      navigate('/cart');
    }
  }, [activeItems, navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSetupCheckout = async (email_override) => {
    // Common setup: attach customer, fetch providers, init payment
    const cartId = medusaCartId || (await ensureCart());
    
    let customerId = null;
    try {
      const profileData = await authService.getCurrentCustomer();
      customerId = profileData?.customer?.id;
    } catch (e) {
      console.warn("[Checkout] No authenticated customer found; proceeding as guest.");
    }

    if (customerId) {
      await assignCustomerToCart(cartId, customerId);
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
    
    const { cart } = await retrieveCart(cartId);
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
        if (!formData.email || !formData.address || !formData.city) {
          showToast("Please fill in all shipping details", "error");
          return;
        }
        setIsProcessing(true);
        try {
          const cartId = medusaCartId || (await ensureCart());
          
          let customerId = null;
          try {
            const profileData = await authService.getCurrentCustomer();
            customerId = profileData?.customer?.id;
          } catch (e) {
            console.warn("[Checkout] No authenticated customer found; proceeding as guest.");
          }

          if (customerId) {
            await assignCustomerToCart(cartId, customerId);
          }

          await setCartGuestDetails(cartId, {
            email: formData.email,
            firstName: formData.first_name,
            lastName: formData.last_name,
            phone: formData.phone,
            addressText: `${formData.address}, ${formData.city}, ${formData.postal_code}`
          });

          const options = await listShippingOptionsForCart(cartId);
          setShippingOptions(options);
          if (options.length > 0) {
            setSelectedShippingId(options[0].id);
            await selectShippingOption(cartId, options[0].id);
          }
          
          await refreshFromServer(cartId);
          
          const { cart } = await retrieveCart(cartId);
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
          showToast(error.message || "Failed to save shipping details", "error");
        } finally {
          setIsProcessing(false);
        }
      }
    } else if (currentStep === 1) {
      if (paymentMethod === 'stripe') {
        setIsProcessing(true);
        try {
          console.log("[Checkout] Initializing Stripe session for cart:", medusaCartId);
          const { cart } = await retrieveCart(medusaCartId);
          const providers = await listPaymentProvidersForRegion(cart.region_id, cart.id);
          const stripePid = pickStripePaymentProviderId(providers);
          if (!stripePid) throw new Error("Stripe not available");
          
          await initiatePaymentSessionForProvider(cart, stripePid);
          const { cart: updatedCart } = await retrieveCart(medusaCartId);
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
          console.log("[Checkout] Initializing PayPal session for cart:", medusaCartId);
          const { cart } = await retrieveCart(medusaCartId);
          const paypalProviderId = availableProviders.find((id) => id === 'paypal' || id.includes('paypal'));
          if (!paypalProviderId) throw new Error("PayPal not available");
          await initiatePaymentSessionForProvider(cart, paypalProviderId);
          console.log("[Checkout] PayPal session initiated");
          
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
    setIsProcessing(true);
    try {
      console.log(`[Checkout] Starting order completion for method: ${paymentData?.method || 'unknown'}`);
      
      if (paymentMethod === 'cod') {
        console.log("[Checkout][COD] Retrieving cart before session init:", medusaCartId);
        const { cart } = await retrieveCart(medusaCartId);

        console.log("[Checkout][COD] Initializing system payment session with provider: pp_system_default");
        const sessionResult = await initiatePaymentSessionForProvider(cart, 'pp_system_default');
        console.log("[Checkout][COD] System payment session attached:", sessionResult);
      }

      console.log(`[Checkout] Calling backend completeCart endpoint for cart ID: ${medusaCartId}...`);
      const result = await completeCart(medusaCartId);
      console.log("[Checkout] Backend Complete Cart Result:", result);

      if (result.type === 'order') {
        console.log("[Checkout] Order created:", {
          customerId: result.order?.customer_id,
          cartId: medusaCartId,
          orderId: result.order?.id,
          salesChannelId: result.order?.sales_channel_id,
        });

        if (!result.order?.customer_id && result.order?.id) {
          const existing = JSON.parse(localStorage.getItem('organic_guest_order_ids') || '[]');
          localStorage.setItem(
            'organic_guest_order_ids',
            JSON.stringify([...new Set([...existing, result.order.id])].slice(-20))
          );
        }

        dispatch(clearCart());
        dispatch(addOrder(result.order));
        showToast("Order placed successfully!", "success");
        navigate('/order-success');
      } else {
        console.error("[Checkout] Order completion failed or returned cart:", result);
        throw new Error("Order completion failed or requires further payment action.");
      }
    } catch (error) {
      console.error("[Checkout] Failed to finalize order:", error);
      showToast("Failed to finalize order", "error");
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
                        <Input label="Postal Code" name="postal_code" value={formData.postal_code} onChange={handleChange} placeholder="12345" />
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
                        <p className="font-bold text-gray-900">Credit / Debit Card</p>
                        <p className="text-xs text-gray-500">Secure payment powered by Stripe</p>
                      </div>
                      <CreditCard size={24} className={paymentMethod === 'stripe' ? 'text-accent-primary' : 'text-stone-300'} />
                    </label>
                    )}

                    {/* 2. PayPal */}
                    {availableProviders.some((id) => id === 'paypal' || id.includes('paypal')) && (
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
                    {!isDigitalOnlyCart && availableProviders.some((id) => id === 'pp_system_default' || id === 'manual' || id.includes('system')) && (
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
                    {!b2bLoading && b2bCompany?.status === "active" && (
                      <label className={`flex items-center gap-4 p-6 rounded-3xl border-2 transition-all cursor-pointer ${
                        b2bMethod ? 'border-accent-primary bg-accent-primary/5' : 'border-gray-200 hover:border-gray-300'
                      }`}>
                        <input type="radio" name="payment" checked={b2bMethod} onChange={() => { setPaymentMethod('b2b_credit'); setB2bMethod(true); }} className="accent-accent-primary w-5 h-5" />
                        <div className="flex-1">
                          <p className="font-bold text-gray-900">Corporate Credit Account</p>
                          <p className="text-xs text-gray-500">
                            {b2bCompany.company_name} — 
                            Credit: {(b2bCompany.credit_limit / 100).toLocaleString('en-US', { style: 'currency', currency: 'EUR' })}
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
                        <Button size="sm" variant="outline" onClick={() => setCurrentStep(1)}>
                          Try Again or Change Method
                        </Button>
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
                                {(b2bCompany?.credit_limit / 100).toLocaleString('en-US', { style: 'currency', currency: 'EUR' })}
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
                                {b2bCreditResult.remainingCredit.toLocaleString('en-US', { style: 'currency', currency: 'EUR' })}
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
              <h3 className="text-xl font-black mb-6 text-gray-900">Your Order</h3>
              <div className="flex flex-col gap-4 mb-6 max-h-60 overflow-y-auto pr-2 scrollbar-hide">
                {activeItems.map(item => (
                  <div key={item.id} className="flex justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                      {item.image && <img src={item.image} className="w-12 h-12 rounded-xl object-cover" alt={item.title} />}
                      <div>
                        <p className="text-sm font-bold line-clamp-1 text-gray-900">{item.title || "Product"}</p>
                        <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                      </div>
                    </div>
                    <span className="text-sm font-black text-gray-900">{formatPrice(item.price * item.quantity)}</span>
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
