import { useState, useEffect, useCallback } from "react";
import { b2bApi } from "../services/b2bApi";
import { getCustomerToken } from "../services/medusa/tokenStorage";

/**
 * @typedef {Object} B2BCompany
 * @property {string} id
 * @property {string} company_name
 * @property {string|null} tax_id
 * @property {number} credit_limit  - in cents
 * @property {"approved"|"active"|"pending"|"rejected"|"inactive"|"suspended"} status
 */

/**
 * Custom hook to fetch the logged-in customer's B2B company data.
 *
 * Returns:
 * - company: the B2BCompany object or null
 * - isLoading: boolean
 * - error: error message or null
 * - creditCheck: { isApproved, remainingCredit, warning }
 *   where creditCheck validates a given cart total against the credit limit.
 *
 * Usage:
 *   const { company, isLoading, creditCheck } = useB2BCompany();
 *   const check = creditCheck(cartTotalCents); // { isApproved, remainingCredit, warning }
 */
export default function useB2BCompany() {
  const [company, setCompany] = useState(/** @type {B2BCompany|null} */ (null));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(/** @type {string|null} */ (null));

  // ── Fetch company on mount ───────────────────────────────────────────

  const fetchCompany = useCallback(async ({ signal, forceRefresh = false } = {}) => {
    setIsLoading(true);
    setError(null);
    if (!getCustomerToken()) {
      setCompany(null);
      setIsLoading(false);
      return;
    }
    try {
      const res = await b2bApi.getCompany({ signal, forceRefresh });
      setCompany(res?.company ?? null);
    } catch (err) {
      if (err?.name === "AbortError") return;
      // Silent fail — user simply has no B2B company (or is not logged in)
      if (err?.response?.status !== 401 && err?.response?.status !== 404) {
        setError("Unable to load B2B application status. Please try again.");
      }
      setCompany(null);
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchCompany({ signal: controller.signal });
    return () => controller.abort();
  }, [fetchCompany]);

  // ── Credit validation helper ─────────────────────────────────────────

  /**
   * Validates a cart total (in major units, e.g. dollars) against the
   * company's credit limit. Returns validation result.
   *
   * @param {number} cartTotal  - total in major units (e.g. 49.99)
   * @returns {{ isApproved: boolean, remainingCredit: number, limit: number, warning: string|null }}
   */
  const creditCheck = useCallback(
    (cartTotal) => {
      const defaultResult = {
        isApproved: true,
        remainingCredit: Infinity,
        limit: 0,
        warning: null,
      };

      if (!company || (company.status !== "active" && company.status !== "approved")) {
        return defaultResult;
      }

      const limit = company.credit_limit / 100; // convert cents to major units
      const remainingCredit = limit - cartTotal;
      const isApproved = remainingCredit >= 0;

      return {
        isApproved,
        remainingCredit: Math.max(0, remainingCredit),
        limit,
        warning: isApproved
          ? null
          : "Order exceeds your corporate credit limit. Please contact your company administrator.",
      };
    },
    [company]
  );

  return {
    company,
    isLoading,
    error,
    refetch: fetchCompany,
    creditCheck,
  };
}