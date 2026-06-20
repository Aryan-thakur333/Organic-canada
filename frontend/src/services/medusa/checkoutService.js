import apiClient from "../apiClient";
import { getDefaultCountryCode } from "../../config/publicEnv";

const CART_CHECKOUT_FIELDS = "id,email,customer_id,sales_channel_id,*items,*region,*items.variant,*shipping_methods,*payment_collection,payment_collection.payment_sessions.*";

export const checkoutService = {
  listShippingOptions: (cartId) =>
    apiClient.get("/store/shipping-options", { params: { cart_id: cartId } }),

  selectShippingOption: (cartId, optionId) =>
    apiClient.post(`/store/carts/${cartId}/shipping-methods`, { 
      option_id: optionId 
    }, { params: { fields: CART_CHECKOUT_FIELDS } }),

  listPaymentProviders: (regionId) =>
    apiClient.get("/store/payment-providers", { 
      params: { region_id: regionId, limit: 50 } 
    }),

  createPaymentCollection: (cartId) =>
    apiClient.post("/store/payment-collections", { cart_id: cartId }),

  initiatePaymentSession: (paymentCollectionId, providerId, data = {}) =>
    apiClient.post(`/store/payment-collections/${paymentCollectionId}/payment-sessions`, {
      provider_id: providerId,
      data
    }),

  completeCart: (cartId) =>
    apiClient.post(`/store/carts/${cartId}/complete`),
};

// Utils & Backward compatibility
export function buildMedusaAddressFromFreeform(fullAddress, meta) {
  const country_code = getDefaultCountryCode();
  const parts = String(fullAddress || "").split(",").map((s) => s.trim()).filter(Boolean);
  const address_1 = parts[0] || String(fullAddress || "").trim() || "Address pending";
  const city = parts[1] || "Unknown";
  const tail = parts.slice(2).join(", ") || city;
  const postalMatch = tail.match(/(\d{4,10})/);
  const postal_code = postalMatch ? postalMatch[1] : "0000";
  const province = tail.replace(postal_code, "").replace(/[-–]/g, "").trim() || city;

  return {
    first_name: meta.firstName || "Guest",
    last_name: meta.lastName || "Customer",
    phone: meta.phone,
    address_1,
    city,
    province: province || city,
    postal_code,
    country_code,
  };
}

export const listShippingOptionsForCart = async (cartId) => {
  const { shipping_options } = await checkoutService.listShippingOptions(cartId);
  return shipping_options || [];
};

export const selectShippingOption = checkoutService.selectShippingOption;
export const completeCart = checkoutService.completeCart;

export const assignCustomerToCart = async (cartId, customerId) => {
  if (!cartId || !customerId) return null;
  console.log("[checkoutService] Attaching authenticated customer to cart:", cartId);
  return apiClient.post(
    `/store/carts/${cartId}`,
    { customer_id: customerId },
    { params: { fields: CART_CHECKOUT_FIELDS } }
  );
};

export const setCartGuestDetails = async (cartId, { email, firstName, lastName, phone, addressText }) => {
  const address = buildMedusaAddressFromFreeform(addressText, { firstName, lastName, phone });
  const payload = {
    email,
    shipping_address: address,
    billing_address: address,
  };
  // In Medusa v2, we rely strictly on the Authorization: Bearer <token> header
  // passed by apiClient to link the logged-in customer to the cart.
  // Passing 'customer_id' in the JSON body throws a 400 Bad Request error.
  return apiClient.post(`/store/carts/${cartId}`, payload, { params: { fields: CART_CHECKOUT_FIELDS } });
};

export const listPaymentProvidersForRegion = async (regionId) => {
  if (!regionId) return [];
  const { payment_providers } = await checkoutService.listPaymentProviders(regionId);
  return payment_providers || [];
};

export function pickSystemPaymentProviderId(providers) {
  const list = Array.isArray(providers) ? providers : [];
  console.log("[pickSystemPaymentProviderId] Providers available:", list.map(p => p.id));
  return list.find(p => 
    p.id === "manual" || 
    p.id === "pp_system_default" || 
    p.id.includes("system") || 
    p.id.includes("manual")
  )?.id || null;
}

export function pickStripePaymentProviderId(providers) {
  const list = Array.isArray(providers) ? providers : [];
  return list.find(p => {
    const id = p.id.toLowerCase();
    return id === "stripe" || id.startsWith("pp_stripe_") || id.includes("stripe");
  })?.id || null;
}

export const initiatePaymentSessionForProvider = async (cart, providerId) => {
  const cartId = typeof cart === "object" ? cart.id : cart;
  const cartObj = typeof cart === "object" ? cart : null;
  
  // 1. Ensure we have a payment collection
  let paymentCollectionId = cartObj?.payment_collection?.id;
  if (!paymentCollectionId) {
    const { payment_collection } = await checkoutService.createPaymentCollection(cartId);
    paymentCollectionId = payment_collection.id;
  }

  // 2. IMPORTANT BUGS BYPASS: Check if the session already exists!
  // Medusa v2 has a bug where trying to re-initiate a session over an existing one
  // throws "Could not delete all payment sessions" (500 Error).
  // To bypass this, we simply reuse the existing session if it matches the provider.
  const existingSessions = cartObj?.payment_collection?.payment_sessions || cartObj?.payment_sessions;
  if (Array.isArray(existingSessions)) {
    const existingSession = existingSessions.find(s => s.provider_id === providerId);
    if (existingSession) {
      console.log("[checkoutService] Reusing existing payment session for provider:", providerId);
      // We still return a successful structure to mimic the initiate response
      return { payment_collection: cartObj.payment_collection };
    }
  }

  // 3. Initiate new session only if we don't have one
  try {
    return await checkoutService.initiatePaymentSession(paymentCollectionId, providerId, {
      description: "Eatsie Store Order",
      email: cartObj?.email,
      customer: cartObj ? {
        name: `${cartObj.shipping_address?.first_name || ""} ${cartObj.shipping_address?.last_name || ""}`.trim() || undefined,
        email: cartObj.email || undefined,
      } : undefined,
    });
  } catch (err) {
    if (err?.response?.status === 500 || err?.message?.includes("delete all payment sessions")) {
      console.warn("[checkoutService] Caught Medusa v2 session deletion bug. Fetching existing session...");
      try {
        const { data } = await apiClient.get(`/store/carts/${cartId}`);
        const latestCart = data?.cart || data;
        const existingSession = latestCart?.payment_collection?.payment_sessions?.find(s => s.provider_id === providerId);
        if (existingSession) {
          console.log("[checkoutService] Successfully recovered existing session from latest cart.");
          return { payment_collection: latestCart.payment_collection };
        }
      } catch (recoverErr) {
        console.error("Failed to recover session", recoverErr);
      }
    }
    
    // Graceful PayPal Init Failure
    if (providerId === "paypal" && err?.response?.status === 500) {
      throw new Error("PayPal initialization failed. Please use Stripe or COD for testing.");
    }
    
    throw err;
  }
};

export function extractStripeClientSecret(cart) {
  if (!cart) return null;
  
  const sessions = cart?.payment_collection?.payment_sessions || cart?.payment_sessions;
  
  if (!Array.isArray(sessions)) {
    return null;
  }

  const stripeSession = sessions.find(s => {
    const id = (s.provider_id || "").toLowerCase();
    return id === "stripe" || id.startsWith("pp_stripe_") || id.includes("stripe");
  });

  if (!stripeSession) {
    return null;
  }

  const secret = stripeSession?.data?.client_secret || stripeSession?.client_secret;
  return secret || null;
}
