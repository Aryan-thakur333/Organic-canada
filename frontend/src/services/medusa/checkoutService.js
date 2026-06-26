import apiClient from "../apiClient";
import { getDefaultCountryCode } from "../../config/publicEnv";

const CART_CHECKOUT_FIELDS = "id,email,customer_id,sales_channel_id,*items,*region,*items.variant,*shipping_methods,*payment_collection,payment_collection.payment_sessions.*";
const paymentSessionRequests = new Map();

const isStripeProviderId = (providerId = "") => {
  const id = providerId.toLowerCase();
  return id === "stripe" || id.startsWith("pp_stripe_") || id.includes("stripe");
};

const findReusablePaymentSession = (paymentCollection, providerId) => {
  const sessions = paymentCollection?.payment_sessions;
  if (!Array.isArray(sessions)) return null;
  return sessions.find((session) => {
    if (session.provider_id !== providerId) return false;
    if (["canceled", "cancelled", "error"].includes(String(session.status).toLowerCase())) return false;
    return !isStripeProviderId(providerId) || Boolean(session.data?.client_secret);
  }) || null;
};

export const checkoutService = {
  listShippingOptions: (cartId) =>
    apiClient.get("/store/shipping-options", { params: { cart_id: cartId } }),

  selectShippingOption: (cartId, optionId) =>
    apiClient.post(`/store/carts/${cartId}/shipping-methods`, { 
      option_id: optionId 
    }, { params: { fields: CART_CHECKOUT_FIELDS } }),

  listPaymentProviders: (regionId, cartId) => cartId
    ? apiClient.get(`/store/carts/${cartId}/payment-providers`)
    : apiClient.get("/store/payment-providers", {
        params: { region_id: regionId, limit: 50 },
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
    `/store/carts/${cartId}/customer`,
    {},
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

export const listPaymentProvidersForRegion = async (regionId, cartId) => {
  if (!regionId) return [];
  const { payment_providers } = await checkoutService.listPaymentProviders(regionId, cartId);
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
  const exact = list.find((provider) => provider.id === "pp_stripe_stripe" || provider.id === "stripe");
  return exact?.id || null;
}

export const initiatePaymentSessionForProvider = async (cart, providerId) => {
  const cartId = typeof cart === "object" ? cart.id : cart;
  const cartObj = typeof cart === "object" ? cart : null;
  if (!cartId) throw new Error("Cart id is required to initialize payment");
  if (!providerId) throw new Error("Payment provider id is required");

  let paymentCollectionId = cartObj?.payment_collection?.id;
  let paymentCollection = cartObj?.payment_collection;
  if (!paymentCollectionId) {
    const created = await checkoutService.createPaymentCollection(cartId);
    paymentCollection = created.payment_collection;
    paymentCollectionId = paymentCollection.id;
  }

  const context = {
    provider_id: providerId,
    payment_collection_id: paymentCollectionId,
    cart_id: cartId,
    region_id: cartObj?.region_id || cartObj?.region?.id,
    amount: paymentCollection?.amount ?? cartObj?.total,
    currency_code: paymentCollection?.currency_code || cartObj?.currency_code,
  };
  console.info("[checkoutService] Payment session context", context);

  const existingSession = findReusablePaymentSession(paymentCollection, providerId);
  if (existingSession) {
    console.info("[checkoutService] Reusing valid payment session", {
      ...context,
      payment_session_id: existingSession.id,
    });
    return { payment_collection: paymentCollection };
  }

  const requestKey = `${paymentCollectionId}:${providerId}`;
  if (paymentSessionRequests.has(requestKey)) {
    console.info("[checkoutService] Reusing in-flight payment session request", context);
    return paymentSessionRequests.get(requestKey);
  }

  const request = (async () => {
    try {
      return await checkoutService.initiatePaymentSession(paymentCollectionId, providerId, {
        payment_description: "Eatsie Store Order",
        metadata: {
          cart_id: cartId,
          region_id: context.region_id,
        },
      });
    } catch (error) {
      let recoveryError;
      try {
        const latest = await apiClient.get(`/store/carts/${cartId}`, {
          params: { fields: CART_CHECKOUT_FIELDS },
        });
        const latestCart = latest?.cart;
        const recoveredSession = findReusablePaymentSession(latestCart?.payment_collection, providerId);
        if (recoveredSession) {
          console.warn("[checkoutService] Session request failed but a valid session was recovered", {
            ...context,
            payment_session_id: recoveredSession.id,
          });
          return { payment_collection: latestCart.payment_collection };
        }
      } catch (caughtRecoveryError) {
        recoveryError = caughtRecoveryError;
      }

      console.error("[checkoutService] Payment session creation failed", {
        ...context,
        status: error?.response?.status,
        backend_error: error?.response?.data || error?.message,
        recovery_error: recoveryError?.response?.data || recoveryError?.message,
      });
      throw error;
    } finally {
      paymentSessionRequests.delete(requestKey);
    }
  })();

  paymentSessionRequests.set(requestKey, request);
  return request;
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

export { findReusablePaymentSession };
