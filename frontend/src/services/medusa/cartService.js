import apiClient from "../apiClient";

const CART_FIELDS = "id,email,customer_id,sales_channel_id,items.*,region.*,region.countries.*,items.variant.*,items.variant.product.*,shipping_methods.*,payment_collection.*,payment_collection.payment_sessions.*,promotions.*";

export const cartService = {
  getCartStorageKey: (mode = "b2c", regionId = "") => {
    const suffix = regionId ? `:${regionId}` : "";
    if (mode === "b2b") return `b2b_cart_id${suffix}`;
    if (mode === "b2b_quote") return `b2b_quote_cart_id${suffix}`;
    return `cart_id${suffix}`;
  },

  retrieve: (cartId) => {
    return apiClient.get(`/store/carts/${cartId}?fields=${CART_FIELDS}`);
  },
    
  create: (body = {}) => {
    return apiClient.post("/store/carts", body, { params: { fields: CART_FIELDS } });
  },
    
  update: (cartId, body) => {
    return apiClient.post(`/store/carts/${cartId}`, body, { params: { fields: CART_FIELDS } });
  },
    
  addLineItem: (cartId, payload) => {
    return apiClient.post(`/store/carts/${cartId}/line-items`, payload, { params: { fields: CART_FIELDS } });
  },
    
  updateLineItem: (cartId, lineId, body) => {
    return apiClient.post(`/store/carts/${cartId}/line-items/${lineId}`, body, { params: { fields: CART_FIELDS } });
  },
    
  deleteLineItem: (cartId, lineId) => {
    return apiClient.delete(`/store/carts/${cartId}/line-items/${lineId}`, { params: { fields: CART_FIELDS } });
  },
    
  complete: (cartId) => {
    return apiClient.post(`/store/carts/${cartId}/complete`, {}, { params: { fields: "id,*items,*shipping_methods,*region" } });
  },
    
  setPromotionCodes: (cartId, codes) => {
    if (!codes || codes.length === 0) {
      return apiClient.post(`/store/carts/${cartId}/promotions`, { promo_codes: [] }, { params: { fields: CART_FIELDS } }).catch(() => cartService.retrieve(cartId));
    }
    return apiClient.post(`/store/carts/${cartId}/promotions`, { promo_codes: codes }, { params: { fields: CART_FIELDS } });
  },

  resetPaymentSession: (cartId) => {
    return apiClient.post(`/store/carts/${cartId}/reset-payment-session`);
  },
};

export const retrieveCart = cartService.retrieve;
export const createCart = cartService.create;
export const updateCart = cartService.update;
export const addLineItem = cartService.addLineItem;
export const updateLineItem = cartService.updateLineItem;
export const deleteLineItem = cartService.deleteLineItem;
export const completeCart = cartService.complete;
export const setPromotionCodes = cartService.setPromotionCodes;
export const getCartStorageKey = cartService.getCartStorageKey;
export const resetPaymentSession = cartService.resetPaymentSession;

/**
 * Build Redux hydration payload from a Medusa cart.
 * @param {Record<string, any>} cart
 * @param {Object} options - Options for cart recovery
 */
export function buildCartHydrationPayload(cart, options = {}) {
  const {
    excludeLineId,
    quantityOverride,
  } = options;

  const validItems = (cart.items || [])
    .filter((item) => item.id !== excludeLineId)
    .filter((item) => Boolean(item.variant_id))
    .filter((item) => item.metadata?.is_platform_fee !== true)
    .filter(
      (item) => String(item.title || "").toLowerCase() !== "platform fee"
    )
    .map((item) => ({
      ...item,
      quantity:
        quantityOverride?.variant_id === item.variant_id
          ? quantityOverride.quantity
          : item.quantity,
    }))
    .filter((item) => item.quantity > 0);

  const items = validItems.map((line) => {
    return {
      variantId: line.variant_id,
      productId: line.product_id || line.variant?.product_id,
      title: line.title || line.product_title || line.variant?.product?.title || "Unknown Product",
      // Medusa amounts in this project are MAJOR units (documented catalog contract).
      price: Number(line.unit_price) || 0,
      quantity: line.quantity,
      image: line.thumbnail || line.variant?.product?.thumbnail || "",
      metadata: line.metadata,
      // Intentionally NOT passing line.id into the payload to prevent stale line ID reuse on frontend during recovery
      id: line.id
    };
  });

  return {
    medusaCartId: String(cart.id),
    regionId: cart.region_id ? String(cart.region_id) : "",
    currencyCode: String(cart.currency_code || "usd").toLowerCase(),
    metadata: cart.metadata || {},
    items,
    promo: {
      code: cart.promotions?.[0]?.code || "",
      discount: Number(cart.discount_total) || 0,
    },
    serverTotals: {
      subtotal: Number(cart.subtotal) || 0,
      total: Number(cart.total) || 0,
      tax: Number(cart.tax_total) || 0,
      shipping: Number(cart.shipping_total) || 0,
      discount: Number(cart.discount_total) || 0,
    },
  };
}
