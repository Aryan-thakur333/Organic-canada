import axios from 'axios';

const API_URL = import.meta.env.VITE_MEDUSA_BACKEND_URL || 'http://localhost:9000';
const PUBLISHABLE_KEY = import.meta.env.VITE_MEDUSA_PUBLISHABLE_KEY;

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'x-publishable-api-key': PUBLISHABLE_KEY,
  },
  withCredentials: true,
});

// Request interceptor: Attach Bearer token from localStorage if present
apiClient.interceptors.request.use(
  (config) => {
    const url = config.url || '';

    // Never attach any auth token to public vendor endpoints
    if (url.includes('/vendor/login') || url.includes('/vendor/register')) {
      delete config.headers.Authorization;
      return config;
    }

    // Determine which token to use based on the URL
    const isVendorRoute = url.includes('/vendor') || url.includes('/admin/vendors') || url.includes('/admin/coupons');
    const token = isVendorRoute
      ? localStorage.getItem('vendor_token')
      : localStorage.getItem('medusa_jwt') || localStorage.getItem('medusa_token');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: Unwrap data, store new tokens, handle errors gracefully
apiClient.interceptors.response.use(
  (response) => {
    const data = response.data;
    // Store token if backend returns one (e.g. after login or registration)
    if (data?.token) {
      const url = response.config?.url || '';
      if (url.includes('/vendor/')) {
        localStorage.setItem('vendor_token', data.token);
      } else {
        localStorage.setItem('medusa_token', data.token);
        localStorage.setItem('medusa_jwt', data.token);
      }
    }
    return data;
  },
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    const message = error.response?.data?.message || error.message;

    // These are expected 401s for unauthenticated guests — do NOT log as errors
    const isSilentAuthCheck =
      status === 401 &&
      (url.includes('/store/customers/me') || url.includes('/auth/session'));

    if (!isSilentAuthCheck) {
      console.error(`[API Error] ${error.config?.method?.toUpperCase()} ${url}:`, message);
    }

    // Clear stale token on any unexpected 401 that isn't a session probe
    if (status === 401 && !isSilentAuthCheck) {
      localStorage.removeItem('medusa_token');
      localStorage.removeItem('medusa_jwt');
    }

    return Promise.reject({ ...error, message });
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
    await axios.get(API_URL, { timeout: 3000 });
    return true;
  } catch (error) {
    if (!error.response || error.code === 'ERR_NETWORK') {
      throw new Error('Backend server is offline. Please start Medusa.');
    }
    // Server responded — alive enough
    return true;
  }
}

/* -------------------------------------------------------------------------- */
/*                       CUSTOMER ORDERS (kept here for backward compat)       */
/* -------------------------------------------------------------------------- */

export const fetchCustomerOrders = async () => {
  try {
    const claimResult = await apiClient.post('/store/orders/claim');
    console.log('[Orders] Claimed unlinked customer orders before listing:', claimResult);
  } catch (error) {
    console.warn('[Orders] Order claim repair skipped or failed:', error.response?.data || error.message);
  }

  const response = await apiClient.get(
    '/store/orders?limit=20&fields=id,status,display_id,total,created_at,email,customer_id,cart_id,sales_channel_id,payment_status,fulfillment_status,*items,*fulfillments'
  );

  console.log('[Orders] Customer order list response:', {
    count: response?.orders?.length || 0,
    orderIds: response?.orders?.map((order) => order.id) || [],
  });

  return response;
};

export const fetchCustomerOrderById = async (id) => {
  return apiClient.get(`/store/orders/${id}?fields=*items,*fulfillments,*shipping_address`);
};
