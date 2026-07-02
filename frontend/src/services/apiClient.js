import axios from 'axios';
import {
  getCustomerToken,
  setCustomerToken,
  VENDOR_TOKEN_KEY,
} from './medusa/tokenStorage';
import { getMedusaPublishableKey } from '../config/publicEnv';

const ENV_URL = import.meta.env.VITE_MEDUSA_BACKEND_URL || 'http://localhost:9000';
const PUBLISHABLE_KEY = getMedusaPublishableKey();

/**
 * Discover the backend URL at runtime.
 *
 * 1. Uses VITE_MEDUSA_BACKEND_URL if set (production).
 * 2. Checks localStorage for a previously detected URL (runtime port discovery).
 * 3. Defaults to http://localhost:9000.
 */
const API_URL = ENV_URL.replace(/\/$/, '');
let backendOfflineUntil = 0;
const orderDetailsCache = new Map();
const orderDetailsInFlight = new Map();
const ORDER_DETAILS_CACHE_TTL_MS = 30_000;
const ORDER_DETAIL_FIELDS = [
  'id',
  'status',
  'display_id',
  'created_at',
  'fulfillment_status',
  'metadata',
  '*items',
  '*shipping_address',
  'fulfillments.id',
  'fulfillments.status',
  'fulfillments.created_at',
  'fulfillments.updated_at',
  'fulfillments.shipped_at',
  'fulfillments.delivered_at',
  'fulfillments.metadata',
  'fulfillments.provider_id',
  'fulfillments.location_id',
].join(',');

function parseRetryAfter(value) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const retryAt = Date.parse(value);
  return Number.isNaN(retryAt) ? null : Math.max(0, retryAt - Date.now());
}

function waitForRequest(request, signal) {
  if (!signal) return request;
  if (signal.aborted) return Promise.reject(new DOMException('Request aborted', 'AbortError'));

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Request aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    request.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}

export function isRequestCanceled(error) {
  return Boolean(
    (typeof axios.isCancel === 'function' && axios.isCancel(error)) ||
    error?.name === 'AbortError' ||
    error?.name === 'CanceledError' ||
    error?.code === 'ERR_CANCELED' ||
    error?.message === 'canceled' ||
    String(error?.message || '').toLowerCase().includes('aborted')
  );
}

function publishBackendStatus(online) {
  if (online) backendOfflineUntil = 0;
  window.dispatchEvent(new CustomEvent('organic-backend-status', {
    detail: { online },
  }));
}

function backendOfflineError() {
  const error = new Error('Backend offline');
  error.code = 'BACKEND_OFFLINE';
  return error;
}

const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'x-publishable-api-key': PUBLISHABLE_KEY,
  },
  withCredentials: true,
});

export function applyCustomerTokenToApiClient(token) {
  if (!token) {
    delete apiClient.defaults.headers.common.Authorization;
    return;
  }
  apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
}

// Request interceptor: Attach Bearer token from localStorage if present
apiClient.interceptors.request.use(
  (config) => {
    const url = config.url || '';
    config.withCredentials = true;
    config.headers = config.headers || {};

    if (Date.now() < backendOfflineUntil) {
      return Promise.reject(backendOfflineError());
    }

    // Never attach any auth token to public auth/registration endpoints
    const isPublicAuthRoute =
      url.includes('/auth/customer/emailpass') ||
      url.includes('/auth/customer/firebase') ||
      url.includes('/vendor/login') ||
      url.includes('/vendor/register') ||
      url.includes('/vendor/account-type');

    if (isPublicAuthRoute) {
      delete config.headers.Authorization;
      return config;
    }

    // Determine which token to use based on the URL
    const isVendorRoute = url.includes('/vendor') || url.includes('/admin/vendors') || url.includes('/admin/coupons');
    const token = isVendorRoute
      ? localStorage.getItem(VENDOR_TOKEN_KEY)
      : getCustomerToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      delete config.headers.Authorization;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: Unwrap data, store new tokens, handle errors gracefully
apiClient.interceptors.response.use(
  (response) => {
    publishBackendStatus(true);
    const data = response.data;
    // Store token if backend returns one (e.g. after login or registration)
    if (data?.token) {
      const url = response.config?.url || '';
      if (url.includes('/vendor/')) {
        localStorage.setItem(VENDOR_TOKEN_KEY, data.token);
      } else {
        setCustomerToken(data.token);
        applyCustomerTokenToApiClient(data.token);
      }
    }
    return data;
  },
  async (error) => {
    if (isRequestCanceled(error)) {
      return undefined;
    }
    if (error.code === 'BACKEND_OFFLINE') {
      return Promise.reject(error);
    }
    const status = error.response?.status;
    const url = error.config?.url || '';
    let message = error.response?.data?.message || error.message;

    // ── Runtime port discovery: if backend is unreachable, probe alternatives ─
    if (!error.response && ['ERR_NETWORK', 'ECONNREFUSED', 'ECONNABORTED'].includes(error.code)) {
      backendOfflineUntil = Date.now() + 5000;
      publishBackendStatus(false);
      error.code = 'BACKEND_OFFLINE';
      error.message = 'Backend offline';
      return Promise.reject(error);
    }

    const config = error.config;
    // A 429 is an explicit instruction to slow down. Retrying it here caused
    // request loops in polling views, so callers receive the error unchanged.
    if (status === 429) {
      const retryAfterMs = parseRetryAfter(error.response?.headers?.['retry-after']);
      error.retryAfterMs = retryAfterMs;
      error.retryAt = retryAfterMs === null ? null : Date.now() + retryAfterMs;
      message = 'Too many requests, please wait';
      error.message = message;
      console.warn('[API] Rate limited', url);
      return Promise.reject(error);
    }

    const transient = Boolean(error.response) && (status === 408 || status >= 500);
    if (config?.method?.toLowerCase() === 'get' && transient && !config.__retried && !config.__skipRetry) {
      config.__retried = true;
      await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 400));
      return apiClient.request(config);
    }

    // These are expected 401s for unauthenticated guests — do NOT log as errors
    const isSilentAuthCheck =
      status === 401 &&
      (url.includes('/store/customers/me') ||
       url.includes('/auth/session') ||
       url.includes('/auth/customer/emailpass'));

    if (!isSilentAuthCheck) {
      console.error(`[API Error] ${error.config?.method?.toUpperCase()} ${url}:`, message);
    }

    if (status === 401) {
      if (url.startsWith('/vendor/')) {
        localStorage.removeItem(VENDOR_TOKEN_KEY);
      }
    }

    // Keep the Axios error instance intact. Spreading Error drops `response`,
    // which made callers unable to distinguish invalid credentials from an
    // offline server and caused Firebase sync to create duplicate customers.
    error.message = message;
    return Promise.reject(error);
  }
);

export default apiClient;

/* -------------------------------------------------------------------------- */
/*                          PRE-FLIGHT HEALTH CHECK                           */
/* -------------------------------------------------------------------------- */

/**
 * Ping the Medusa backend to verify it's reachable before attempting auth.
 */
export async function checkBackendHealth() {
  try {
    await axios.get(`${API_URL}/health`, { timeout: 3000 });
    publishBackendStatus(true);
    return true;
  } catch (error) {
    if (!error.response || error.code === 'ERR_NETWORK') {
      backendOfflineUntil = Date.now() + 5000;
      publishBackendStatus(false);
      throw backendOfflineError();
    }
    // Server responded — alive enough
    return true;
  }
}

/* -------------------------------------------------------------------------- */
/*                       CUSTOMER ORDERS (kept here for backward compat)       */
/* -------------------------------------------------------------------------- */

export const fetchCustomerOrders = async () => {
  const guestOrderIds = JSON.parse(localStorage.getItem('organic_guest_order_ids') || '[]');
  if (guestOrderIds.length) {
    try {
      await apiClient.post('/store/orders/claim', { order_ids: guestOrderIds });
      localStorage.removeItem('organic_guest_order_ids');
    } catch (error) {
      console.warn('[Orders] Guest order claim failed:', error.response?.data || error.message);
    }
  }

  const response = await apiClient.get(
    '/store/orders?limit=20&fields=id,status,display_id,total,created_at,email,customer_id,cart_id,sales_channel_id,payment_status,fulfillment_status,metadata,*items,fulfillments.id,fulfillments.status,fulfillments.created_at,fulfillments.updated_at,fulfillments.shipped_at,fulfillments.delivered_at,fulfillments.metadata,fulfillments.provider_id,fulfillments.location_id'
  );

  console.log('[Orders] Customer order list response:', {
    count: response?.orders?.length || 0,
    orderIds: response?.orders?.map((order) => order.id) || [],
  });

  return response;
};

export const fetchCustomerOrderById = async (id, { signal, forceRefresh = false } = {}) => {
  if (!id) throw new Error('Order id is required');

  const cached = orderDetailsCache.get(id);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  let request = orderDetailsInFlight.get(id);
  if (!request) {
    request = apiClient
      .get(`/store/orders/${id}?fields=${ORDER_DETAIL_FIELDS}`)
      .then((data) => {
        orderDetailsCache.set(id, {
          data,
          expiresAt: Date.now() + ORDER_DETAILS_CACHE_TTL_MS,
        });
        return data;
      })
      .finally(() => {
        orderDetailsInFlight.delete(id);
      });
    orderDetailsInFlight.set(id, request);
  }

  return waitForRequest(request, signal);
};

export const getCachedCustomerOrderById = (id) => {
  const cached = orderDetailsCache.get(id);
  return cached?.data || null;
};
