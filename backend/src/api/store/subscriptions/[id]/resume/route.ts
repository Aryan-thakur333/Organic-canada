import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getStripeClient } from "../../../../../lib/stripe-client"
import { SUBSCRIPTION_MODULE } from "../../../../../modules/subscription"
import { canTransitionSubscription } from "../../../../../modules/subscription/contract"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id
  const service: any = req.scope.resolve(SUBSCRIPTION_MODULE)
  try {
    const subscription = await service.retrieveSubscription(req.params.id)
    if (subscription.customer_id !== customerId) return res.status(404).json({ code: "SUBSCRIPTION_NOT_FOUND", message: "Subscription not found." })
    if (subscription.status === "active") return res.json({ subscription, reused: true })
    if (!canTransitionSubscription(subscription.status, "active")) {
      return res.status(409).json({ code: "SUBSCRIPTION_TRANSITION_INVALID", message: "This subscription cannot be resumed." })
    }
    if (!subscription.stripe_subscription_id || subscription.stripe_subscription_id.startsWith("cs_")) {
      return res.status(409).json({ code: "SUBSCRIPTION_PROVIDER_PENDING", message: "The provider subscription is not ready." })
    }
    const provider: any = await getStripeClient().subscriptions.update(
      subscription.stripe_subscription_id,
      { pause_collection: "" } as any
    )
    const periodEnd = provider.current_period_end ? new Date(provider.current_period_end * 1000) : subscription.next_billing_date
    const updated = await service.updateSubscriptions({
      id: subscription.id,
      status: "active",
      paused_at: null,
      current_period_end: periodEnd,
      next_billing_date: periodEnd,
    })
    return res.json({ subscription: updated, reused: false })
  } catch (error: any) {
    console.error(`[Subscriptions] resume failed: ${error?.code || "SUBSCRIPTION_RESUME_FAILED"}`)
    return res.status(500).json({ code: "SUBSCRIPTION_RESUME_FAILED", message: "Unable to resume subscription." })
  }
}

