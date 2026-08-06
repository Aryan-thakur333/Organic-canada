import apiClient from "../apiClient";
import { 
  resetPaymentSession, 
  buildCartHydrationPayload, 
  createCart, 
  addLineItem,
  getCartStorageKey,
} from "./cartService";

const CART_CHECKOUT_FIELDS = "id,email,customer_id,sales_channel_id,*items,*region,region.countries.*,*items.variant,*shipping_methods,*payment_collection,payment_collection.payment_sessions.*";
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
export function buildMedusaAddress({ firstName, lastName, phone, address1, city, province: stateProvince, postalCode, countryCode }) {
  const fullAddress = address1;
  const meta = { firstName, lastName, phone };
  const parts = String(fullAddress || "").split(",").map((s) => s.trim()).filter(Boolean);
  const parsedAddress = parts[0] || String(fullAddress || "").trim() || "Address pending";
  const parsedCity = parts[1] || "Unknown";
  const tail = parts.slice(2).join(", ") || parsedCity;
  const postalMatch = tail.match(/(\d{4,10})/);
  const postal_code = postalMatch ? postalMatch[1] : "0000";
  const province = tail.replace(postal_code, "").replace(/[-–]/g, "").trim() || city;

  return {
    first_name: String(firstName || "").trim(),
    last_name: String(lastName || "").trim(),
    phone: String(phone || "").trim() || undefined,
    address_1: String(address1 || "").trim(),
    city: String(city || "").trim(),
    province: String(stateProvince || "").trim(),
    postal_code: String(postalCode || "").trim(),
    country_code: String(countryCode || "").trim().toLowerCase(),
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

export async function ensureCustomerAttachedToCart({ cart, customer }) {
  if (!cart?.id || !customer?.id) {
    return cart;
  }

  const sameCustomer = cart.customer_id === customer.id;
  const sameEmail = String(cart.email || "").toLowerCase() === String(customer.email || "").toLowerCase();

  if (sameCustomer && sameEmail) {
    return cart;
  }

  console.log("[checkoutService] Idempotently attaching customer:", { cartId: cart.id, customerId: customer.id });
  const res = await apiClient.post(
    `/store/carts/${cart.id}/customer`,
    {},
    { params: { fields: CART_CHECKOUT_FIELDS } }
  );
  return res.cart || res;
}

export async function recreateCheckoutCart(oldCart, customer) {
  const copyAddress = (address) => {
    if (!address || typeof address !== 'object') return undefined;
    const { id, created_at, updated_at, deleted_at, ...safeAddress } = address;
    return safeAddress;
  };
  const oldItems = Array.isArray(oldCart?.items) ? oldCart.items : [];
  const bundleGroups = new Map();
  const standaloneItems = oldItems.filter((item) => {
    const groupId = item?.metadata?.bundle_group_id;
    if (item?.metadata?.commerce_type !== "FIXED_BUNDLE_COMPONENT" || !groupId) return true;
    if (!bundleGroups.has(groupId)) {
      bundleGroups.set(groupId, {
        bundleId: item.metadata?.bundle_id,
        quantity: Number(item.metadata?.bundle_quantity || 0),
      });
    }
    return false;
  });
  
  const { cart: newCart } = await createCart({
    region_id: oldCart.region_id,
    sales_channel_id: oldCart.sales_channel_id,
    email: customer?.email || oldCart.email,
    shipping_address: copyAddress(oldCart.shipping_address),
    billing_address: copyAddress(oldCart.billing_address),
    metadata: {
      ...oldCart.metadata,
      cart_type: "b2c",
      recovered_from_cart_id: oldCart.id,
    },
  });

  if (!newCart?.id) {
    throw new Error("New checkout cart has no ID");
  }

  localStorage.setItem(getCartStorageKey("b2c", newCart.region_id), newCart.id);

  let hydratedCart = newCart;

  for (const item of standaloneItems) {
    try {
      const res = await addLineItem(newCart.id, {
        variant_id: item.variant_id,
        quantity: item.quantity,
        metadata: item.metadata
      });
      hydratedCart = res.cart;
    } catch (e) {
      console.warn(`[checkoutService] Failed to re-add standalone item to fresh cart`, e);
    }
  }

  // Fixed bundles must be rebuilt from their BundleDefinition. Copying their
  // component lines would retain old allocation metadata and no snapshot.
  for (const group of bundleGroups.values()) {
    if (!group.bundleId || !Number.isInteger(group.quantity) || group.quantity < 1) {
      throw new Error("BUNDLE_CART_REBUILD_REQUIRED");
    }
    const response = await apiClient.post(`/store/carts/${newCart.id}/bundled-line-items`, {
      bundle_id: group.bundleId,
      quantity: group.quantity,
    });
    hydratedCart = response?.cart || hydratedCart;
  }

  return hydratedCart;
}

export async function prepareCheckoutCartForUpdate(cart) {
  const sessions = cart?.payment_collection?.payment_sessions || cart?.payment_sessions || [];

  if (!sessions.length) {
    return cart;
  }

  try {
    console.log("[checkoutService] Resetting payment session before update", cart.id);
    const response = await resetPaymentSession(cart.id);
    return response.cart || response.data?.cart || cart;
  } catch (error) {
    if (
      error.response?.status === 409 ||
      error.response?.data?.recreate_cart === true ||
      String(error.message).toLowerCase().includes("payment session is stale")
    ) {
      console.log("[checkoutService] Stale session, recreating checkout cart");
      return recreateCheckoutCart(cart);
    }

    throw error;
  }
}

export const setCartGuestDetails = async (cartId, { email, firstName, lastName, phone, address1, city, province, postalCode, countryCode }) => {
  const hasShippingAddress = Boolean(address1 || city || province || postalCode || countryCode);
  const address = hasShippingAddress ? buildMedusaAddress({ firstName, lastName, phone, address1, city, province, postalCode, countryCode }) : null;
  const payload = { email };
  if (address) {
    payload.shipping_address = address;
    payload.billing_address = address;
  }
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
      // ---> NEW COMMISSION INTEGRATION: Calculate platform fee before generating Stripe payment intent <---
      console.info(`[checkoutService] Calculating platform commission for cart ${cartId} before payment init...`);
      let refreshedCartData;
      refreshedCartData = await apiClient.post(`/store/carts/${cartId}/calculate-commission`);
      console.info(`[checkoutService] Commission calculated:`, refreshedCartData?.breakdown);
      // ---> END COMMISSION INTEGRATION <---

      // Fetch the latest cart to verify the amount
      const latest = await apiClient.get(`/store/carts/${cartId}`, {
        params: { fields: CART_CHECKOUT_FIELDS },
      });
      const finalCart = latest?.cart || refreshedCartData?.cart || cartObj;

      if (!finalCart) {
        throw new Error("Could not retrieve refreshed cart after commission calculation.");
      }

      console.log("[CHECKOUT_FINAL_AMOUNT]", {
        cart_id: finalCart.id,
        subtotal: finalCart.subtotal,
        platform_fee: finalCart.metadata?.platform_fee_total,
        tax_total: finalCart.tax_total,
        shipping_total: finalCart.shipping_total,
        total: finalCart.total,
      });

      const response = await checkoutService.initiatePaymentSession(paymentCollectionId, providerId, {
        payment_description: "Eatsie Store Order",
        metadata: {
          cart_id: cartId,
          region_id: context.region_id,
        },
      });

      // Verify Stripe session amount (Phase 9)
      const session = findReusablePaymentSession(response?.payment_collection, providerId);
      console.log("[STRIPE_SESSION_VERIFY]", {
        cart_id: finalCart.id,
        cart_total: finalCart.total,
        provider_id: session?.provider_id,
        session_amount: session?.amount || session?.data?.amount || null,
        currency_code: finalCart.currency_code,
        has_client_secret: !!session?.data?.client_secret,
      });

      const sessionAmount = session?.amount || session?.data?.amount;
      if (sessionAmount && sessionAmount !== finalCart.total && providerId === "pp_stripe_stripe") {
        console.warn("[checkoutService] Stripe session amount mismatch. Deleting session and retrying...");
        await apiClient.post(`/store/carts/${cartId}/payment-sessions/${session.id}/delete`); // If such route exists or just reset
        throw new Error("Payment session amount mismatch. Please try again.");
      }

      return response;
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

/** Creates the native collection only after a shipping method has been selected. */
export const ensurePaymentCollection = async (cart) => {
  const cartId = typeof cart === "string" ? cart : cart?.id;
  if (!cartId) throw new Error("Cart id is required to create a payment collection");
  if (typeof cart === "object" && cart?.payment_collection?.id) return cart.payment_collection;
  const created = await checkoutService.createPaymentCollection(cartId);
  return created?.payment_collection || created?.data?.payment_collection || created;
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
