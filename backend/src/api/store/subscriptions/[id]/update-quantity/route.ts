import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { getStripeClient } from "../../../../../lib/stripe-client"
import { SUBSCRIPTION_MODULE } from "../../../../../modules/subscription"

const Schema = z.object({ item_id: z.string().min(1), quantity: z.number().int().min(1).max(100) }).strict()

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = Schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ code: "SUBSCRIPTION_INPUT_INVALID", message: "Invalid quantity request." })
  const customerId = (req as any).auth_context?.actor_id
  const service: any = req.scope.resolve(SUBSCRIPTION_MODULE)
  try {
    const subscription = await service.retrieveSubscription(req.params.id)
    if (subscription.customer_id !== customerId) return res.status(404).json({ code: "SUBSCRIPTION_NOT_FOUND", message: "Subscription not found." })
    if (!["active", "paused"].includes(subscription.status)) return res.status(409).json({ code: "SUBSCRIPTION_TRANSITION_INVALID", message: "Quantity cannot be changed in the current state." })
    const items = await service.listSubscriptionItems({ subscription_id: subscription.id }, { order: { created_at: "ASC" } })
    const localIndex = items.findIndex((item: any) => item.id === parsed.data.item_id)
    if (localIndex < 0) return res.status(404).json({ code: "SUBSCRIPTION_ITEM_NOT_FOUND", message: "Subscription item not found." })
    if (!subscription.stripe_subscription_id || subscription.stripe_subscription_id.startsWith("cs_")) return res.status(409).json({ code: "SUBSCRIPTION_PROVIDER_PENDING", message: "The provider subscription is not ready." })
    const provider: any = await getStripeClient().subscriptions.retrieve(subscription.stripe_subscription_id, { expand: ["items.data.price"] })
    const providerItem = provider.items?.data?.[localIndex]
    if (!providerItem) throw new Error("PROVIDER_ITEM_MAPPING_MISSING")
    await getStripeClient().subscriptionItems.update(providerItem.id, { quantity: parsed.data.quantity })
    await service.updateSubscriptionItems({ id: items[localIndex].id, quantity: parsed.data.quantity })
    const updatedItems = items.map((item: any, index: number) => index === localIndex ? { ...item, quantity: parsed.data.quantity } : item)
    const amount = updatedItems.reduce((sum: number, item: any) => sum + item.unit_price_snapshot * item.quantity, 0)
    const updated = await service.updateSubscriptions({ id: subscription.id, amount })
    return res.json({ subscription: updated, items: updatedItems })
  } catch (error: any) {
    console.error(`[Subscriptions] quantity update failed: ${error?.code || "SUBSCRIPTION_QUANTITY_FAILED"}`)
    return res.status(500).json({ code: "SUBSCRIPTION_QUANTITY_FAILED", message: "Unable to update subscription quantity." })
  }
}

