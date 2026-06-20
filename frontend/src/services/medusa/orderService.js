import apiClient from "../apiClient";

const ORDER_FIELDS = "id,status,display_id,created_at,email,total,subtotal,tax_total,discount_total,shipping_total,items,shipping_address,billing_address,payment_status,fulfillment_status";

export const orderService = {
  list: (params = {}) => 
    apiClient.get("/store/orders", { 
      params: { 
        fields: ORDER_FIELDS,
        ...params 
      } 
    }),
    
  retrieve: (id, params = {}) => 
    apiClient.get(`/store/orders/${id}`, { 
      params: { 
        fields: ORDER_FIELDS,
        ...params 
      } 
    }),

  listByCartId: (cartId) =>
    apiClient.get("/store/orders", {
      params: {
        cart_id: [cartId],
        fields: ORDER_FIELDS
      }
    }),

  listOrders: (params = {}) => 
    apiClient.get("/store/orders", { 
      params: { 
        fields: ORDER_FIELDS,
        ...params 
      } 
    }),
};

// Backward compatibility
export const listOrders = (query) => orderService.list(query);
export const getOrder = (id) => orderService.retrieve(id);
export const getOrderByCartId = async (cartId) => {
  const { orders } = await orderService.listByCartId(cartId);
  return orders?.[0] || null;
};
