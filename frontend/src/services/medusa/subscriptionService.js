import apiClient from '../apiClient';
import { getCustomerToken } from './tokenStorage';

let subscriptionsInFlight = null;
let subscriptionsInFlightToken = null;
let subscriptionsCache = null;
let subscriptionsCacheUntil = 0;
let subscriptionsCacheToken = null;

const listCustomerSubscriptions = () => {
  const token = getCustomerToken();
  if (subscriptionsCacheToken !== token) clearSubscriptionCache();
  if (subscriptionsCache && Date.now() < subscriptionsCacheUntil) return Promise.resolve(subscriptionsCache);
  if (subscriptionsInFlight && subscriptionsInFlightToken === token) return subscriptionsInFlight;
  subscriptionsInFlightToken = token;
  subscriptionsInFlight = apiClient.get('/store/customers/me/subscriptions')
    .then((result) => {
      subscriptionsCache = result;
      subscriptionsCacheToken = token;
      subscriptionsCacheUntil = Date.now() + 10_000;
      return result;
    })
    .finally(() => {
      if (subscriptionsInFlightToken === token) {
        subscriptionsInFlight = null;
        subscriptionsInFlightToken = null;
      }
    });
  return subscriptionsInFlight;
};

const clearSubscriptionCache = () => {
  subscriptionsCache = null;
  subscriptionsCacheUntil = 0;
  subscriptionsCacheToken = null;
};

export const subscriptionService = {
  /**
   * Retrieve list of subscriptions for the currently logged-in customer.
   */
  list: listCustomerSubscriptions,

  /**
   * Retrieve details for a specific subscription.
   */
  retrieve: (id) => apiClient.get(`/store/subscriptions/${id}`),

  /**
   * Pause an active subscription.
   */
  pause: async (id) => { const result = await apiClient.post(`/store/subscriptions/${id}/pause`); clearSubscriptionCache(); return result; },

  /**
   * Resume a paused subscription.
   */
  resume: async (id) => { const result = await apiClient.post(`/store/subscriptions/${id}/resume`); clearSubscriptionCache(); return result; },

  /**
   * Cancel an active/paused subscription.
   */
  cancel: async (id) => { const result = await apiClient.post(`/store/subscriptions/${id}/cancel`); clearSubscriptionCache(); return result; },

  /**
   * Create a new subscription record (called after successful checkout).
   */
  create: async (data) => { const result = await apiClient.post('/store/subscriptions', data); clearSubscriptionCache(); return result; },

  /**
   * Verify a Stripe Checkout session after redirect and activate premium.
   * Called by CustomerSubscriptions page when it detects ?session_id=xxx in the URL.
   * The backend verifies the Stripe session and sets customer metadata is_premium=true.
   */
  verifySession: (sessionId) => apiClient.get(`/store/subscriptions?session_id=${encodeURIComponent(sessionId)}`),

  /**
   * Retry a failed payment for a subscription (customer-facing).
   */
  retryPayment: (subscriptionId) => apiClient.post(`/store/subscriptions/${subscriptionId}/retry`),

  /**
   * List available subscription plans.
   */
  listPlans: () => apiClient.get('/store/subscription-plans'),
};

/**
 * Admin subscription service for managing all subscriptions, plans, and failed payments.
 */
export const adminSubscriptionService = {
  /** Retrieve all subscriptions with optional status filter. Also returns analytics (MRR, churn, etc.). */
  list: (status) => apiClient.get('/admin/subscriptions', { params: status ? { status } : undefined }),

  /** Retrieve a single subscription by ID. */
  retrieve: (id) => apiClient.get(`/admin/subscriptions/${id}`),

  /** Update a subscription's status (active, paused, cancelled, past_due, expired). */
  updateStatus: (id, status) => apiClient.patch(`/admin/subscriptions/${id}`, { status }),

  /** List all subscriptions with failed payment attempts. */
  listFailedPayments: () => apiClient.get('/admin/subscriptions/failed-payments'),

  /** Retry a failed payment for a subscription. */
  retryPayment: (subscriptionId) => apiClient.post('/admin/subscriptions/failed-payments', { subscription_id: subscriptionId }),

  /** List all subscription plans. */
  listPlans: () => apiClient.get('/admin/subscription-plans'),

  /** List only active plans (for customer-facing display). */
  listActivePlans: () => apiClient.get('/admin/subscription-plans?active=true'),

  /** Create a new subscription plan. */
  createPlan: (data) => apiClient.post('/admin/subscription-plans', data),

  /** Update an existing subscription plan. */
  updatePlan: (id, data) => apiClient.patch(`/admin/subscription-plans/${id}`, data),

  /** Delete a subscription plan. */
  deletePlan: (id) => apiClient.delete(`/admin/subscription-plans/${id}`),
};
