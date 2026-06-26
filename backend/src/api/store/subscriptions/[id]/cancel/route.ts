import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SUBSCRIPTION_MODULE } from "../../../../../modules/subscription"
import { Modules } from "@medusajs/framework/utils"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const customer_id = (req as any).auth_context?.actor_id

  try {
    const subscriptionService: any = req.scope.resolve(SUBSCRIPTION_MODULE)
    const eventBus: any = req.scope.resolve(Modules.EVENT_BUS)
    const subscription = await subscriptionService.retrieveSubscription(id)
    if (!subscription) return res.status(404).json({ message: "Subscription not found" })
    if (subscription.customer_id !== customer_id) return res.status(403).json({ message: "Forbidden" })
    if (["cancelled", "expired"].includes(subscription.status)) {
      return res.status(400).json({ message: "Subscription is already cancelled or expired" })
    }

    const updated = await subscriptionService.updateSubscriptions({ id, status: "cancelled" })

    // Update customer premium status
    try {
      const customerService: any = req.scope.resolve(Modules.CUSTOMER)
      const customer = await customerService.retrieveCustomer(customer_id)
      await customerService.updateCustomers({
        id: customer_id,
        metadata: {
          ...(customer.metadata || {}),
          is_premium: false,
          premium_cancelled_at: new Date().toISOString(),
        },
      })
    } catch { /* non-critical */ }

    // Emit cancellation event
    try {
      await eventBus.emit({
        name: "subscription.cancelled",
        data: {
          id,
          customer_email: subscription.customer_email,
          reason: "Customer requested cancellation",
        },
      })
    } catch { /* non-critical */ }

    return res.json({ subscription: updated })
  } catch (error: any) {
    return res.status(500).json({ message: error.message || "Failed to cancel subscription" })
  }
}
