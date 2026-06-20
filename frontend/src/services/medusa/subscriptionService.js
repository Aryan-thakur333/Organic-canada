import apiClient from '../apiClient';

export const subscriptionService = {
  /**
   * Retrieve list of subscriptions for the currently logged-in customer.
   */
  list: () => apiClient.get('/store/subscriptions'),

  /**
   * Retrieve details for a specific subscription.
   */
  retrieve: (id) => apiClient.get(`/store/subscriptions/${id}`),

  /**
   * Pause an active subscription.
   */
  pause: (id) => apiClient.post(`/store/subscriptions/${id}/pause`),

  /**
   * Resume a paused subscription.
   */
  resume: (id) => apiClient.post(`/store/subscriptions/${id}/resume`),

  /**
   * Cancel an active/paused subscription.
   */
  cancel: (id) => apiClient.post(`/store/subscriptions/${id}/cancel`),

  /**
   * Create a new subscription record (called after successful checkout).
   */
  create: (data) => apiClient.post('/store/subscriptions', data),

  /**
   * Verify a Stripe Checkout session after redirect and activate premium.
   * Called by CustomerSubscriptions page when it detects ?session_id=xxx in the URL.
   * The backend verifies the Stripe session and sets customer metadata is_premium=true.
   */
  verifySession: (sessionId) => apiClient.get(`/store/subscriptions?session_id=${encodeURIComponent(sessionId)}`),
};

export const adminSubscriptionService = {
  /**
   * Retrieve list of all subscriptions (optionally filtered by status).
   * Also returns analytics data (MRR, active, paused, churn).
   */
  list: (status) => apiClient.get('/admin/subscriptions', { params: status ? { status } : undefined }),

  /**
   * Retrieve details for a subscription.
   */
  retrieve: (id) => apiClient.get(`/admin/subscriptions/${id}`),

  /**
   * Update a subscription's status (active, paused, cancelled, past_due, expired).
   */
  updateStatus: (id, status) => apiClient.patch(`/admin/subscriptions/${id}`, { status }),
};
