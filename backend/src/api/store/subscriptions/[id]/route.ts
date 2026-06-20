import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SUBSCRIPTION_MODULE } from "../../../../modules/subscription"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const customer_id = (req as any).auth_context?.actor_id

  try {
    const subscriptionService: any = req.scope.resolve(SUBSCRIPTION_MODULE)
    const subscription = await subscriptionService.retrieveSubscription(id)

    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found" })
    }
    if (subscription.customer_id !== customer_id) {
      return res.status(403).json({ message: "Forbidden" })
    }

    return res.json({ subscription })
  } catch (error: any) {
    return res.status(500).json({ message: error.message || "Failed to retrieve subscription" })
  }
}
