import apiClient from '../apiClient';
import {
  clearCustomerToken,
  getCustomerToken,
  setCustomerToken,
} from './tokenStorage';

let pendingCustomerRequest;

function clearCustomerTokens() {
  clearCustomerToken();
}

/**
 * Unified Customer Auth Service — single source of truth for all auth operations.
 *
 * Uses Medusa v2 standard endpoints:
 *   POST /auth/customer/emailpass/register  → create auth identity
 *   POST /auth/customer/emailpass           → login
 *   POST /store/customers                   → create customer profile
 *   GET  /store/customers/me                → get current customer
 */
export const authService = {
  /* ---------------------------------------------------------------------- */
  /*  REGISTER — two-step Medusa v2 flow + auto-login                       */
  /* ---------------------------------------------------------------------- */

  /**
   * Register a new customer.
   *
   * Step 1: POST /auth/customer/emailpass/register → creates auth identity, returns JWT
   * Step 2: POST /store/customers with Bearer token → creates customer profile
   * Step 3: Token is already stored — customer is auto-logged-in
   *
   * @returns {{ token: string, customer: object }}
   */
  register: async ({ email, password, first_name, last_name, phone }) => {
    console.log('[AuthService] Initiating customer registration for email:', email);
    // Step 1 — create auth identity
    let authResp;
    try {
      authResp = await apiClient.post('/auth/customer/emailpass/register', {
        email: email.trim().toLowerCase(),
        password,
      });
    } catch (error) {
      // A previous attempt can create the identity and fail before creating the
      // customer profile. Recover by authenticating that identity instead of
      // repeatedly trying to register it.
      if (![400, 409].includes(error.response?.status)) throw error;
      authResp = await apiClient.post('/auth/customer/emailpass', {
        email: email.trim().toLowerCase(),
        password,
      });
    }

    const token = authResp?.token;
    console.log('[AuthService] Registration auth identity token received:', token ? '[PRESENT]' : '[MISSING]');
    if (!token) {
      throw new Error(
        'Registration failed: no token returned from auth system.'
      );
    }

    // Store token so Step 2 (customer creation) can use it
    setCustomerToken(token);
    console.log('[AuthService] Saved customer auth token. Creating customer profile in Medusa...');

    // Step 2 — create customer profile linked to the auth identity
    let customerResp;
    try {
      if (!getCustomerToken()) {
        throw new Error('Registration cannot create a customer profile without an auth token.');
      }
      customerResp = await apiClient.post('/store/customers', {
        email: email.trim().toLowerCase(),
        first_name: first_name || '',
        last_name: last_name || '',
        phone: phone || '',
      });
    } catch (error) {
      if (![400, 409].includes(error.response?.status)) {
        clearCustomerToken();
        throw error;
      }
      customerResp = null;
    }

    // Medusa's registration token can create the profile but may not yet carry
    // the customer actor context required by /store/customers/me. Authenticate
    // once more after profile creation and persist that customer-scoped token.
    const loginResp = await apiClient.post('/auth/customer/emailpass', {
      email: email.trim().toLowerCase(),
      password,
    });
    const customerToken = loginResp?.token;
    if (!customerToken) {
      clearCustomerToken();
      throw new Error('Customer profile was created but login returned no token.');
    }
    setCustomerToken(customerToken);

    if (!customerResp) {
      customerResp = await apiClient.get('/store/customers/me');
    }
    const customer = customerResp?.customer || customerResp;
    console.log('[AuthService] Customer profile successfully created in Medusa:', customer?.id, customer?.email);

    // Step 3 — token is already stored, customer is auto-logged-in
    return { token: customerToken, customer };
  },

  /* ---------------------------------------------------------------------- */
  /*  LOGIN                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * Log in a customer with email + password.
   *
   * POST /auth/customer/emailpass → returns JWT
   *
   * @returns {object} auth response (contains token)
   */
  login: async (email, password) => {
    const normalizedEmail = email.trim().toLowerCase();
    console.log('[AuthService] Customer login attempt initiated for email:', normalizedEmail);
    clearCustomerTokens();

    const authResp = await apiClient.post('/auth/customer/emailpass', {
      email: normalizedEmail,
      password,
    });

    const token = authResp?.token;
    console.log('[AuthService] Login response token received:', token ? '[PRESENT]' : '[MISSING]');
    if (token) {
      setCustomerToken(token);
      console.log('[AuthService] Generated customer JWT token saved');
    }

    return authResp;
  },

  loginWithFirebase: async (idToken) => {
    const authResp = await apiClient.post('/auth/customer/firebase', {
      id_token: idToken,
    });
    if (!authResp?.token) throw new Error('Firebase authentication returned no Medusa token.');
    setCustomerToken(authResp.token);
    return authResp;
  },

  createCustomerProfile: async (data) => {
    if (!getCustomerToken()) {
      const error = new Error('Cannot create customer profile without a Medusa customer token.');
      error.code = 'AUTH_REQUIRED';
      throw error;
    }
    return apiClient.post('/store/customers', data);
  },

  requestPasswordReset: async (email) => {
    await apiClient.post('/auth/customer/emailpass/reset-password', {
      identifier: email.trim().toLowerCase(),
    });
    // Always return the same result to prevent account enumeration.
    return true;
  },

  /* ---------------------------------------------------------------------- */
  /*  LOGOUT                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * Log out the current customer: invalidate session on backend + clear local state.
   */
  logout: async () => {
    console.log('[AuthService] Customer logout requested.');
    try {
      await apiClient.delete('/auth/session');
    } catch (err) {
      console.warn('[AuthService] Failed to call logout endpoint on backend:', err.message);
      // Ignore — we're logging out regardless
    } finally {
      clearCustomerToken();
      console.log('[AuthService] Local tokens cleared from localStorage.');
      // Clear session cookies
      document.cookie.split(';').forEach((c) => {
        document.cookie = c
          .replace(/^ +/, '')
          .replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
      });
    }
  },

  /* ---------------------------------------------------------------------- */
  /*  CUSTOMER PROFILE                                                      */
  /* ---------------------------------------------------------------------- */

  /** GET /store/customers/me */
  getCurrentCustomer: async () => {
    const token = getCustomerToken();
    if (!token) {
      const error = new Error('Unauthenticated profile');
      error.code = 'AUTH_REQUIRED';
      throw error;
    }

    if (pendingCustomerRequest) return pendingCustomerRequest;

    pendingCustomerRequest = apiClient.get('/store/customers/me')
      .catch((error) => {
        if (error.response?.status === 401) clearCustomerTokens();
        throw error;
      })
      .finally(() => {
        pendingCustomerRequest = undefined;
      });

    return pendingCustomerRequest;
  },

  /** POST /store/customers/me */
  updateCustomer: async (data) => {
    console.log('[AuthService] Updating customer profile (/store/customers/me)');
    return apiClient.post('/store/customers/me', data);
  },

  /* ---------------------------------------------------------------------- */
  /*  ADDRESSES                                                             */
  /* ---------------------------------------------------------------------- */

  listAddresses: async () => {
    console.log('[AuthService] Listing customer addresses');
    return apiClient.get('/store/customers/me/addresses');
  },

  addAddress: async (address) => {
    console.log('[AuthService] Adding customer address');
    return apiClient.post('/store/customers/me/addresses', address);
  },

  updateAddress: async (addressId, address) => {
    return apiClient.post(`/store/customers/me/addresses/${addressId}`, address);
  },

  deleteAddress: async (addressId) => {
    console.log('[AuthService] Deleting address:', addressId);
    return apiClient.delete(`/store/customers/me/addresses/${addressId}`);
  },
};
