import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SUBSCRIPTION_MODULE } from "../../../../modules/subscription"

/**
 * GET /store/subscriptions/:id
 * Retrieve a specific subscription for the current customer.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const customer_id = (req as any).auth_context?.actor_id

  try {
    const subscriptionService: any = req.scope.resolve(SUBSCRIPTION_MODULE)
    const subscription = await subscriptionService.retrieveSubscription(id)

    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found" })
    }
    if (subscription.customer_id !== customer_id) return res.status(404).json({ code: "SUBSCRIPTION_NOT_FOUND", message: "Subscription not found." })

    const items = await subscriptionService.listSubscriptionItems({ subscription_id: id })
    const orders = await subscriptionService.listSubscriptionBillingOrders({ subscription_id: id }, { order: { created_at: "DESC" } })
    return res.json({ subscription, items, orders })
  } catch (error: any) {
    return res.status(500).json({ code: "SUBSCRIPTION_RETRIEVE_FAILED", message: "Unable to retrieve subscription." })
  }
}
