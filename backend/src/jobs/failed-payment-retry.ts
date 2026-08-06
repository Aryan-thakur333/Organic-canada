import type { MedusaContainer } from "@medusajs/framework/types"
import { isCommerceFeatureEnabled } from "../lib/commerce-feature-flags"

/** Stripe Billing's retry/dunning policy owns failed invoice retries. */
export default async function failedPaymentRetryCompatibilityJob(_container: MedusaContainer) {
  if (!isCommerceFeatureEnabled("subscriptions")) return
  return
}

export const config = { name: "failed-payment-retry-compatibility", schedule: "0 12 */3 * *" }
