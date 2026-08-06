import apiClient from "./apiClient";

export const vendorApi = {
  // Vendor Auth
  register: (payload) => apiClient.post("/vendor/register", payload),
  login: (payload) => apiClient.post("/vendor/login", payload),
  getProfile: () => apiClient.get("/vendor/me"),
  getMe: async () => {
    const res = await apiClient.get("/vendor/me");
    return res?.vendor || null;
  },

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

  orderAction: (orderId, action, reason = "") =>
    apiClient.post(`/vendor/orders/action/${orderId}`, { action, reason }),
  getOrder: (id) => apiClient.get(`/vendor/orders/${id}`),
  acceptOrder: (orderId) => apiClient.post(`/vendor/orders/${orderId}/accept`),
  rejectOrder: (orderId, reason) => apiClient.post(`/vendor/orders/${orderId}/reject`, { reason }),
  allocateOrder: (orderId) => apiClient.post(`/vendor/orders/${orderId}/allocate`),
  prepareOrder: (orderId) => apiClient.post(`/vendor/orders/${orderId}/prepare`),
  fulfillOrder: (orderId, locationId) => apiClient.post(`/vendor/orders/${orderId}/fulfill`, { location_id: locationId }),
  shipOrder: (orderId, payload) => apiClient.post(`/vendor/orders/${orderId}/ship`, payload),
  deliverOrder: (orderId) => apiClient.post(`/vendor/orders/${orderId}/deliver`),
  getOrderAction: (orderId) => apiClient.get(`/vendor/orders/action/${orderId}`),

  // Stock Locations
  getStockLocations: () => apiClient.get("/vendor/stock-locations"),

  // Inventory Audit
  getInventoryAudit: (params = {}) => apiClient.get("/vendor/inventory/audit", { params }),

  // Admin approval management
  adminListVendors: () => apiClient.get("/admin/vendors"),
  adminApproveVendor: (id) => apiClient.post(`/admin/vendors/${id}/approve`),
  adminRejectVendor: (id) => apiClient.post(`/admin/vendors/${id}/reject`),

  // Personalization Templates & Fields
  getPersonalizationTemplates: () => apiClient.get("/vendor/personalization-templates"),
  createPersonalizationTemplate: (payload) => apiClient.post("/vendor/personalization-templates", payload),
  getPersonalizationTemplate: (id) => apiClient.get(`/vendor/personalization-templates/${id}`),
  updatePersonalizationTemplate: (id, payload) => apiClient.put(`/vendor/personalization-templates/${id}`, payload),
  deletePersonalizationTemplate: (id) => apiClient.delete(`/vendor/personalization-templates/${id}`),
  publishPersonalizationTemplate: (id) => apiClient.post(`/vendor/personalization-templates/${id}/publish`),
  createPersonalizationField: (templateId, payload) => apiClient.post(`/vendor/personalization-templates/${templateId}/fields`, payload),
  updatePersonalizationField: (templateId, fieldId, payload) => apiClient.put(`/vendor/personalization-templates/${templateId}/fields/${fieldId}`, payload),
  deletePersonalizationField: (templateId, fieldId) => apiClient.delete(`/vendor/personalization-templates/${templateId}/fields/${fieldId}`),

  // Order Item Personalization Actions
  getOrderItemPersonalization: (orderId, itemId) => apiClient.get(`/vendor/orders/${orderId}/items/${itemId}/personalization`),
  updateOrderItemPersonalizationStatus: (orderId, itemId, action, notes = "") => apiClient.put(`/vendor/orders/${orderId}/items/${itemId}/personalization`, { action, notes }),
};
