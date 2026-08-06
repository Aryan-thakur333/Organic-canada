import type { MedusaContainer } from "@medusajs/framework/types"
import { isCommerceFeatureEnabled } from "../lib/commerce-feature-flags"

/** Stripe Billing and signed invoice webhooks own renewal charges/orders. */
export default async function subscriptionRenewalCompatibilityJob(_container: MedusaContainer) {
  if (!isCommerceFeatureEnabled("subscriptions")) return
  return
}

export const config = { name: "subscription-renewal-compatibility", schedule: "0 6 * * *" }
