import apiClient from "./apiClient";

export const vendorApi = {
  // Vendor Auth
  register: (payload) => apiClient.post("/vendor/register", payload),
  login: (payload) => apiClient.post("/vendor/login", payload),
  getProfile: () => apiClient.get("/vendor/me"),

  // Products Sandbox
  getProducts: () => apiClient.get("/vendor/products"),
  createProduct: (payload) => apiClient.post("/vendor/products", payload),
  updateProduct: (id, payload) => apiClient.put(`/vendor/products/${id}`, payload),
  deleteProduct: (id) => apiClient.delete(`/vendor/products/${id}`),

  // Orders and Stats Sandbox
  getOrders: () => apiClient.get("/vendor/orders"),
  getStats: () => apiClient.get("/vendor/stats"),

  // Admin approval management
  adminListVendors: () => apiClient.get("/admin/vendors"),
  adminApproveVendor: (id) => apiClient.post(`/admin/vendors/${id}/approve`),
  adminRejectVendor: (id) => apiClient.post(`/admin/vendors/${id}/reject`),
};
