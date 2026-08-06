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
    if (subscription.status === "cancelled") return res.json({ subscription, reused: true })
    if (!canTransitionSubscription(subscription.status, "cancelled")) {
      return res.status(409).json({ code: "SUBSCRIPTION_TRANSITION_INVALID", message: "This subscription cannot be cancelled." })
    }
    if (subscription.stripe_subscription_id && !subscription.stripe_subscription_id.startsWith("cs_")) {
      await getStripeClient().subscriptions.cancel(subscription.stripe_subscription_id)
    } else if (subscription.stripe_subscription_id?.startsWith("cs_")) {
      await getStripeClient().checkout.sessions.expire(subscription.stripe_subscription_id)
    }
    const updated = await service.updateSubscriptions({ id: subscription.id, status: "cancelled", cancelled_at: new Date() })
    return res.json({ subscription: updated, reused: false })
  } catch (error: any) {
    console.error(`[Subscriptions] cancel failed: ${error?.code || "SUBSCRIPTION_CANCEL_FAILED"}`)
    return res.status(500).json({ code: "SUBSCRIPTION_CANCEL_FAILED", message: "Unable to cancel subscription." })
  }
}

