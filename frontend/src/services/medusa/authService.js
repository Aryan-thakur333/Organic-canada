import apiClient from '../apiClient';

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
    // Step 1 — create auth identity
    const authResp = await apiClient.post('/auth/customer/emailpass/register', {
      email,
      password,
    });

    const token = authResp?.token;
    if (!token) {
      throw new Error(
        'Registration failed: no token returned from auth system.'
      );
    }

    // Store token so Step 2 (customer creation) can use it
    localStorage.setItem('medusa_token', token);

    // Step 2 — create customer profile linked to the auth identity
    const customerResp = await apiClient.post('/store/customers', {
      email,
      first_name: first_name || '',
      last_name: last_name || '',
      phone: phone || '',
    });

    const customer = customerResp?.customer || customerResp;

    // Step 3 — token is already stored, customer is auto-logged-in
    return { token, customer };
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
    localStorage.removeItem('medusa_token');
    localStorage.removeItem('medusa_jwt');

    const authResp = await apiClient.post('/auth/customer/emailpass', {
      email,
      password,
    });

    const token = authResp?.token;
    if (token) {
      localStorage.setItem('medusa_token', token);
    }

    return authResp;
  },

  /* ---------------------------------------------------------------------- */
  /*  LOGOUT                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * Log out the current customer: invalidate session on backend + clear local state.
   */
  logout: async () => {
    try {
      await apiClient.delete('/auth/session');
    } catch {
      // Ignore — we're logging out regardless
    } finally {
      localStorage.removeItem('medusa_token');
      localStorage.removeItem('medusa_jwt');
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
    return apiClient.get('/store/customers/me');
  },

  /** POST /store/customers/me */
  updateCustomer: async (data) => {
    return apiClient.post('/store/customers/me', data);
  },

  /* ---------------------------------------------------------------------- */
  /*  ADDRESSES                                                             */
  /* ---------------------------------------------------------------------- */

  listAddresses: async () => {
    return apiClient.get('/store/customers/me/addresses');
  },

  addAddress: async (address) => {
    return apiClient.post('/store/customers/me/addresses', { address });
  },

  deleteAddress: async (addressId) => {
    return apiClient.delete(`/store/customers/me/addresses/${addressId}`);
  },
};
