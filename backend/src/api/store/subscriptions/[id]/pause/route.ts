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
    if (subscription.status === "paused") return res.json({ subscription, reused: true })
    if (!canTransitionSubscription(subscription.status, "paused") || subscription.metadata?.pause_allowed === false) {
      return res.status(409).json({ code: "SUBSCRIPTION_TRANSITION_INVALID", message: "This subscription cannot be paused." })
    }
    if (!subscription.stripe_subscription_id || subscription.stripe_subscription_id.startsWith("cs_")) {
      return res.status(409).json({ code: "SUBSCRIPTION_PROVIDER_PENDING", message: "The provider subscription is not ready." })
    }
    await getStripeClient().subscriptions.update(subscription.stripe_subscription_id, {
      pause_collection: { behavior: "void" },
    })
    const updated = await service.updateSubscriptions({ id: subscription.id, status: "paused", paused_at: new Date() })
    return res.json({ subscription: updated, reused: false })
  } catch (error: any) {
    console.error(`[Subscriptions] pause failed: ${error?.code || "SUBSCRIPTION_PAUSE_FAILED"}`)
    return res.status(500).json({ code: "SUBSCRIPTION_PAUSE_FAILED", message: "Unable to pause subscription." })
  }
}

