import type { MedusaContainer } from "@medusajs/framework/types"
import { isCommerceFeatureEnabled } from "../lib/commerce-feature-flags"
import { getStripeClient } from "../lib/stripe-client"
import { SUBSCRIPTION_MODULE } from "../modules/subscription"

const STRIPE_TO_LOCAL_STATUS: Record<string, string> = {
  active: "active",
  trialing: "active",
  past_due: "past_due",
  unpaid: "past_due",
  paused: "paused",
  canceled: "cancelled",
  incomplete_expired: "expired",
}

/**
 * Stripe Billing owns all recurring charges. This job only reconciles local
 * state for records whose webhook delivery may have been delayed. It must
 * never create a PaymentIntent, invoice, charge, or Medusa order.
 */
export default async function subscriptionBillingReconciliationJob(container: MedusaContainer) {
  if (!isCommerceFeatureEnabled("subscriptions")) return
  if (!process.env.STRIPE_API_KEY) return

  const service: any = container.resolve(SUBSCRIPTION_MODULE)
  const candidates = await service.listSubscriptions({
    status: ["active", "past_due", "paused"],
  }, { take: 100 })

  for (const local of candidates) {
    if (!local.stripe_subscription_id || local.stripe_subscription_id.startsWith("cs_")) continue
    try {
      const provider: any = await getStripeClient().subscriptions.retrieve(local.stripe_subscription_id)
      const status = STRIPE_TO_LOCAL_STATUS[provider.status] || local.status
      const periodStart = provider.current_period_start
        ? new Date(provider.current_period_start * 1000)
        : local.current_period_start
      const periodEnd = provider.current_period_end
        ? new Date(provider.current_period_end * 1000)
        : local.current_period_end

      await service.updateSubscriptions({
        id: local.id,
        status,
        stripe_customer_id: typeof provider.customer === "string" ? provider.customer : provider.customer?.id,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        next_billing_date: periodEnd,
        metadata: {
          ...(local.metadata || {}),
          last_provider_reconciliation_at: new Date().toISOString(),
        },
      })
    } catch (error: any) {
      console.error(`[Subscription Reconciliation] ${local.id}: ${error?.code || "PROVIDER_RECONCILIATION_FAILED"}`)
    }
  }
}

export const config = {
  name: "subscription-billing-reconciliation",
  schedule: "0 */6 * * *",
}

