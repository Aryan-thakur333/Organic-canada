import apiClient from "./apiClient";

export const b2bApi = {
  /**
   * GET /store/b2b/company
   * Returns the authenticated customer's linked company, or { company: null }.
   */
  getCompany: () => apiClient.get("/store/b2b/company"),

  /**
   * POST /store/b2b/company
   * Onboards a new B2B company and links the customer as admin.
   * @param {{ company_name: string, tax_id?: string, credit_limit?: number }} payload
   */
  registerCompany: (payload) => apiClient.post("/store/b2b/company", payload),

  /**
   * POST /store/b2b/quotes
   * Submits a wholesale quote request with line items for admin review.
   * The customer must have an active B2B company linked to their account.
   *
   * @param {{
   *   items: Array<{ title: string, quantity: number, unit_price: number, product_id?: string, variant_id?: string, sku?: string }>,
   *   notes?: string
   * }} payload
   * @returns {Promise<{ message: string, quote: object }>}
   */
  submitQuote: (payload) => apiClient.post("/store/b2b/quotes", payload),

  /**
   * GET /store/b2b/quotes
   * Returns the authenticated customer's own quote requests.
   *
   * @param {{ status?: string, offset?: number, limit?: number }} [params]
   * @returns {Promise<{ quotes: Array<object>, count: number, offset: number, limit: number }>}
   */
  getQuotes: (params) => apiClient.get("/store/b2b/quotes", { params }),
  getQuote: (id) => apiClient.get(`/store/b2b/quotes/${id}`),
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
  updateCompany: (payload) => apiClient.patch("/store/b2b/company", payload),

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
};
