import apiClient from "./apiClient";
import { authService } from "./medusa/authService";

const COMPANY_CACHE_TTL_MS = 60_000;
const B2B_SESSION_CACHE_TTL_MS = 60_000;
let companyCache = null;
let companyInFlight = null;
let b2bSessionCache = null;
let b2bSessionInFlight = null;

const APPROVED_B2B_STATUSES = new Set(["approved", "active"]);

function isAbortError(error) {
  return error?.name === "AbortError" || error?.code === "ERR_CANCELED";
}

function waitForRequest(request, signal) {
  if (!signal) return request;
  if (signal.aborted) return Promise.reject(new DOMException("Request aborted", "AbortError"));

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Request aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    request.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

function clearCompanyCache() {
  companyCache = null;
  b2bSessionCache = null;
}

function normalizeCompany(value) {
  if (!value || typeof value !== "object") return null;
  return {
    ...value,
    status: typeof value.status === "string" ? value.status : null,
  };
}

function normalizeCustomer(value) {
  if (!value || typeof value !== "object") return null;
  return value.customer && typeof value.customer === "object" ? value.customer : value;
}

function extractCompanyFromCustomer(customer) {
  if (!customer || typeof customer !== "object") return null;

  const candidates = [
    Array.isArray(customer.company) ? customer.company[0] : customer.company,
    Array.isArray(customer.companies) ? customer.companies[0] : customer.companies,
    customer.metadata?.company,
    customer.metadata?.b2b_company,
    customer.metadata?.b2bCompany,
  ];

  for (const candidate of candidates) {
    const company = normalizeCompany(candidate);
    if (company?.id || company?.company_name) return company;
  }

  return null;
}

function isApprovedB2BCompany(company) {
  return APPROVED_B2B_STATUSES.has(company?.status);
}

function getCompany({ signal, forceRefresh = false } = {}) {
  const now = Date.now();

  if (!forceRefresh && companyCache && companyCache.expiresAt > now) {
    return Promise.resolve(companyCache.data);
  }

  if (!companyInFlight) {
    companyInFlight = apiClient
      .get("/store/b2b/company", { __skipRetry: true, signal, withCredentials: true })
      .then((data) => {
        companyCache = {
          data,
          expiresAt: Date.now() + COMPANY_CACHE_TTL_MS,
        };
        return data;
      })
      .catch((error) => {
        if (!isAbortError(error)) {
          clearCompanyCache();
        }
        throw error;
      })
      .finally(() => {
        companyInFlight = null;
      });
  }

  return waitForRequest(companyInFlight, signal);
}

function hydrateB2BSession({ signal, forceRefresh = false } = {}) {
  const now = Date.now();

  if (!forceRefresh && b2bSessionCache && b2bSessionCache.expiresAt > now) {
    return Promise.resolve(b2bSessionCache.data);
  }

  if (!b2bSessionInFlight) {
    b2bSessionInFlight = (async () => {
      const customerResponse = await authService.getCurrentCustomer({ signal });
      const customer = normalizeCustomer(customerResponse);
      const customerCompany = extractCompanyFromCustomer(customer);
      const companyResponse = await getCompany({ signal, forceRefresh });
      const apiCompany = normalizeCompany(companyResponse?.company);
      const company = apiCompany || customerCompany;
      const hasCompany = Boolean(company);
      const hasApprovedB2BAccess = isApprovedB2BCompany(company);

      const session = {
        customer,
        company,
        hasCompany,
        hasApprovedB2BAccess,
        status: company?.status ?? null,
      };

      b2bSessionCache = {
        data: session,
        expiresAt: Date.now() + B2B_SESSION_CACHE_TTL_MS,
      };

      if (company) {
        companyCache = {
          data: { company },
          expiresAt: Date.now() + COMPANY_CACHE_TTL_MS,
        };
      }

      return session;
    })()
      .catch((error) => {
        if (!isAbortError(error)) {
          clearCompanyCache();
        }
        throw error;
      })
      .finally(() => {
        b2bSessionInFlight = null;
      });
  }

  return waitForRequest(b2bSessionInFlight, signal);
}

export const b2bApi = {
  /**
   * GET /store/b2b/company
   * Returns the authenticated customer's linked company, or { company: null }.
   */
  getCompany,
  hydrateB2BSession,
  clearCompanyCache,

  getB2BProducts: ({ signal, ...params } = {}) => apiClient.get("/store/b2b/products", {
    params: {
      currency_code: "cad",
      ...params,
    },
    __skipRetry: true,
    withCredentials: true,
    signal,
  }),

  /**
   * POST /store/b2b/company
   * Onboards a new B2B company and links the customer as admin.
   * @param {{ company_name: string, tax_id?: string, credit_limit?: number }} payload
   */
  registerCompany: async (payload) => {
    const data = await apiClient.post("/store/b2b/company", payload);
    clearCompanyCache();
    return data;
  },

  /**
   * POST /store/b2b/quotes
   * Submits a wholesale quote request with line items for admin review.
   * The customer must have an active B2B company linked to their account.
   *
   * @param {{
   *   items: Array<{ product_id: string, variant_id: string, quantity: number, note?: string }>,
   *   buyer_note?: string
   * }} payload
   * @returns {Promise<{ message: string, quote: { id: string, status: string } }>}
   */
  submitQuote: (payload) => apiClient.post("/store/b2b/quotes", payload),
  createQuote: (payload) => apiClient.post("/store/b2b/quotes", payload),

  /**
   * GET /store/b2b/quotes
   * Returns the authenticated customer's own quote requests.
   *
   * @param {{ status?: string, offset?: number, limit?: number }} [params]
   * @returns {Promise<{ quotes: Array<object>, count: number, offset: number, limit: number }>}
   */
  getQuotes: ({ signal, ...params } = {}) => apiClient.get("/store/b2b/quotes", {
    params: {
      limit: 10,
      offset: 0,
      ...params,
    },
    __skipRetry: true,
    withCredentials: true,
    signal,
  }),
  getQuote: (id, { signal } = {}) => apiClient.get(`/store/b2b/quotes/${id}`, {
    __skipRetry: true,
    withCredentials: true,
    signal,
  }),
  acceptQuote: (id, payload = {}) => apiClient.post(`/store/b2b/quotes/${id}/accept`, payload),
  rejectQuote: (id) => apiClient.post(`/store/b2b/quotes/${id}/reject`),

  /**
   * GET /admin/b2b-quotes
   * Lists all B2B quotes for admin review with optional status/pagination/company_id filters.
   *
   * @param {{ status?: string, offset?: number, limit?: number, company_id?: string }} [params]
   * @returns {Promise<{ quotes: Array<object>, count: number }>}
   */
  adminListQuotes: (params) => apiClient.get("/admin/b2b-quotes", { params }),

  /**
   * POST /admin/b2b-quotes/:id/review
   * Approves or rejects a quote. Approval triggers the order conversion workflow.
   *
   * @param {string} id - Quote ID
   * @param {{ status: 'approved' | 'rejected', negotiated_total?: number, admin_notes?: string }} payload
   * @returns {Promise<{ message: string, quote: object }>}
   */
  adminReviewQuote: (id, payload) => apiClient.post(`/admin/b2b-quotes/${id}/review`, payload),

  /**
   * PATCH /store/b2b/company
   * Updates the authenticated customer's B2B company details.
   * @param {{ company_name?: string, tax_id?: string | null, credit_limit?: number }} payload
   * @returns {Promise<{ message: string, company: object }>}
   */
  updateCompany: async (payload) => {
    const data = await apiClient.patch("/store/b2b/company", payload);
    clearCompanyCache();
    return data;
  },

  /**
   * GET /store/b2b/company/members
   * Returns all team members linked to the customer's B2B company.
   * @returns {Promise<{ members: Array<object>, company_name: string }>}
   */
  getCompanyMembers: () => apiClient.get("/store/b2b/company/members"),

  /**
   * GET /admin/b2b/companies
   * Lists all registered B2B companies with customer counts and quote stats.
   * @param {{ status?: string, search?: string, offset?: number, limit?: number }} [params]
   * @returns {Promise<{ companies: Array<object>, count: number, offset: number, limit: number }>}
   */
  adminListCompanies: (params) => apiClient.get("/admin/b2b/companies", { params }),

  /**
   * POST /admin/b2b/companies/:id/status
   * Updates a company's status (active/inactive/suspended).
   * @param {string} id - Company ID
   * @param {{ status: 'active' | 'inactive' | 'suspended' }} payload
   * @returns {Promise<{ message: string, company: object }>}
   */
  adminUpdateCompanyStatus: (id, payload) => apiClient.post(`/admin/b2b/companies/${id}/status`, payload),

  /**
   * POST /admin/b2b/companies/:id/approve
   * Approves a pending B2B company application and adds customer to B2B group.
   * @param {string} id - Company ID
   * @param {{ approved_credit_limit?: number, admin_note?: string }} [payload]
   * @returns {Promise<{ message: string, company: object, customer_group?: object }>}
   */
  adminApproveCompany: async (id, payload = {}) => {
    const data = await apiClient.post(`/admin/b2b/companies/${id}/approve`, payload);
    clearCompanyCache();
    return data;
  },

  /**
   * POST /admin/b2b/companies/:id/reject
   * Rejects a pending B2B company application.
   * @param {string} id - Company ID
   * @param {{ reason?: string, admin_note?: string }} [payload]
   * @returns {Promise<{ message: string, company: object }>}
   */
  adminRejectCompany: async (id, payload = {}) => {
    const data = await apiClient.post(`/admin/b2b/companies/${id}/reject`, payload);
    clearCompanyCache();
    return data;
  },

  /**
   * POST /admin/b2b/companies/:id/suspend
   * Suspends an approved B2B company.
   * @param {string} id - Company ID
   * @param {{ admin_note?: string }} [payload]
   * @returns {Promise<{ message: string, company: object }>}
   */
  adminSuspendCompany: async (id, payload = {}) => {
    const data = await apiClient.post(`/admin/b2b/companies/${id}/suspend`, payload);
    clearCompanyCache();
    return data;
  },
};
