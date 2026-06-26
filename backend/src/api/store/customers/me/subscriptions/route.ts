import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { SUBSCRIPTION_MODULE } from "../../../../../modules/subscription"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id
  const service: any = req.scope.resolve(SUBSCRIPTION_MODULE)
  const subscriptions = await service.listSubscriptions(
    { customer_id: customerId },
    { order: { created_at: "DESC" } }
  )
  return res.json({ subscriptions, count: subscriptions.length })
}
