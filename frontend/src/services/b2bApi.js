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
};
