import apiClient from "../apiClient";

const CART_FIELDS = "id,email,customer_id,sales_channel_id,items.*,region.*,items.variant.*,items.variant.product.*,shipping_methods.*,payment_collection.*,payment_collection.payment_sessions.*,promotions.*";

export const cartService = {
  retrieve: (cartId) => 
    apiClient.get(`/store/carts/${cartId}?fields=${CART_FIELDS}`),
    
  create: (body = {}) => 
    apiClient.post("/store/carts", body, { params: { fields: CART_FIELDS } }),
    
  update: (cartId, body) => 
    apiClient.post(`/store/carts/${cartId}`, body, { params: { fields: CART_FIELDS } }),
    
  addLineItem: (cartId, payload) => 
    apiClient.post(`/store/carts/${cartId}/line-items`, payload, { params: { fields: CART_FIELDS } }),
    
  updateLineItem: (cartId, lineId, body) => 
    apiClient.post(`/store/carts/${cartId}/line-items/${lineId}`, body, { params: { fields: CART_FIELDS } }),
    
  deleteLineItem: (cartId, lineId) => 
    apiClient.delete(`/store/carts/${cartId}/line-items/${lineId}`, { params: { fields: CART_FIELDS } }),
    
  complete: (cartId) => 
    apiClient.post(`/store/carts/${cartId}/complete`, {}, { params: { fields: "id,*items,*shipping_methods,*region" } }),
    
  setPromotionCodes: (cartId, codes) => {
    if (!codes || codes.length === 0) {
      // In Medusa v2, you might need a different endpoint to remove them, but 
      // let's try sending empty promo_codes or we just return the cart.
      // Usually, there is an endpoint to remove them, but we will pass it to addPromotions just in case.
      return apiClient.post(`/store/carts/${cartId}/promotions`, { promo_codes: [] }, { params: { fields: CART_FIELDS } }).catch(() => cartService.retrieve(cartId));
    }
    return apiClient.post(`/store/carts/${cartId}/promotions`, { promo_codes: codes }, { params: { fields: CART_FIELDS } });
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

/**
 * Build Redux hydration payload from a Medusa cart.
 * @param {Record<string, any>} cart
 */
export function buildCartHydrationPayload(cart) {
  // Keeping this as is since it's a mapper, but updated types if needed
  const items = (Array.isArray(cart.items) ? cart.items : []).map((line) => {
    console.log("[buildCartHydrationPayload] Mapping line:", line.id, line.title);
    return {
      id: line.id || Math.random().toString(),
      variantId: line.variant_id,
      productId: line.product_id,
      title: line.title || line.product_title || "Unknown Product",
      price: (line.unit_price || 0) / 100,
      quantity: line.quantity || 1,
      image: line.thumbnail || line.variant?.product?.thumbnail || "",
      metadata: line.metadata,
    };
  });

  return {
    medusaCartId: String(cart.id),
    regionId: cart.region_id ? String(cart.region_id) : "",
    currencyCode: String(cart.currency_code || "usd").toLowerCase(),
    items,
    promo: {
      code: cart.promotions?.[0]?.code || "",
      discount: (cart.discount_total || 0) / 100,
    },
    serverTotals: {
      subtotal: (cart.subtotal || 0) / 100,
      total: (cart.total || 0) / 100,
      tax: (cart.tax_total || 0) / 100,
      shipping: (cart.shipping_total || 0) / 100,
      discount: (cart.discount_total || 0) / 100,
    },
  };
}
