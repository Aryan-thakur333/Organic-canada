import apiClient from "./apiClient";

export const vendorApi = {
  // Vendor Auth
  register: (payload) => apiClient.post("/vendor/register", payload),
  login: (payload) => apiClient.post("/vendor/login", payload),
  getProfile: () => apiClient.get("/vendor/me"),

  // Products
  getProducts: () => apiClient.get("/vendor/products"),
  createProduct: (payload) => apiClient.post("/vendor/products", payload),
  updateProduct: (id, payload) => apiClient.patch(`/vendor/products/${id}`, payload),
  deleteProduct: (id) => apiClient.delete(`/vendor/products/${id}`),

  // Categories & Tags
  getProductCategories: () => apiClient.get("/vendor/product-categories"),
  getProductTags: () => apiClient.get("/vendor/product-tags"),

  // Orders, Stats, Inventory
  getOrders: () => apiClient.get("/vendor/orders"),
  getStats: () => apiClient.get("/vendor/stats"),
  getInventory: () => apiClient.get("/vendor/inventory"),
  updateInventoryByVariant: (variantId, inventoryQuantity) =>
    apiClient.patch(`/vendor/inventory/${variantId}`, { inventory_quantity: inventoryQuantity }),
  getEarnings: () => apiClient.get("/vendor/earnings"),
  updateInventory: (levelId, stockedQuantity, notes = "") =>
    apiClient.post("/vendor/inventory", { level_id: levelId, stocked_quantity: stockedQuantity, notes }),
  getPayouts: () => apiClient.get("/vendor/payouts"),
  requestPayout: (amount) => apiClient.post("/vendor/payouts", { amount }),

  // Order Fulfillment & Tracking
  addTracking: (orderId, trackingCode, carrier = "Other", trackingUrl = "") =>
    apiClient.post(`/vendor/orders/fulfill/${orderId}`, {
      tracking_code: trackingCode,
      carrier,
      tracking_url: trackingUrl,
    }),
  getTracking: (orderId) => apiClient.get(`/vendor/orders/fulfill/${orderId}`),

  // Order Accept/Reject/Fulfill Actions
  orderAction: (orderId, action, reason = "") =>
    apiClient.post(`/vendor/orders/action/${orderId}`, { action, reason }),
  acceptOrder: (orderId) => apiClient.post(`/vendor/orders/${orderId}/accept`),
  packOrder: (orderId) => apiClient.post(`/vendor/orders/${orderId}/pack`),
  shipOrder: (orderId, payload) => apiClient.post(`/vendor/orders/${orderId}/ship`, payload),
  deliverOrder: (orderId) => apiClient.post(`/vendor/orders/${orderId}/deliver`),
  getOrderAction: (orderId) => apiClient.get(`/vendor/orders/action/${orderId}`),

  // Inventory Audit
  getInventoryAudit: (params = {}) => apiClient.get("/vendor/inventory/audit", { params }),

  // Admin approval management
  adminListVendors: () => apiClient.get("/admin/vendors"),
  adminApproveVendor: (id) => apiClient.post(`/admin/vendors/${id}/approve`),
  adminRejectVendor: (id) => apiClient.post(`/admin/vendors/${id}/reject`),
};
