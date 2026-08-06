import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"
import { getStripeClient } from "../../../../../lib/stripe-client"
import { SUBSCRIPTION_MODULE } from "../../../../../modules/subscription"

const Address = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  address_1: z.string().trim().min(1).max(200),
  address_2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().min(1).max(100),
  province: z.string().trim().max(100).optional().nullable(),
  postal_code: z.string().trim().min(1).max(32),
  country_code: z.string().trim().length(2).transform((value) => value.toLowerCase()),
  phone: z.string().trim().max(32).optional().nullable(),
}).strict()
const Schema = z.object({ shipping_address: Address, billing_address: Address.optional() }).strict()

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const parsed = Schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ code: "SUBSCRIPTION_INPUT_INVALID", message: "Invalid address request." })
  const customerId = (req as any).auth_context?.actor_id
  const service: any = req.scope.resolve(SUBSCRIPTION_MODULE)
  try {
    const subscription = await service.retrieveSubscription(req.params.id)
    if (subscription.customer_id !== customerId) return res.status(404).json({ code: "SUBSCRIPTION_NOT_FOUND", message: "Subscription not found." })
    if (["cancelled", "expired"].includes(subscription.status)) return res.status(409).json({ code: "SUBSCRIPTION_TRANSITION_INVALID", message: "Address cannot be changed in the current state." })
    if (subscription.stripe_customer_id) {
      const address = parsed.data.shipping_address
      await getStripeClient().customers.update(subscription.stripe_customer_id, {
        shipping: {
          name: `${address.first_name} ${address.last_name}`.trim(),
          phone: address.phone || undefined,
          address: {
            line1: address.address_1,
            line2: address.address_2 || undefined,
            city: address.city,
            state: address.province || undefined,
            postal_code: address.postal_code,
            country: address.country_code.toUpperCase(),
          },
        },
      })
    }
    const updated = await service.updateSubscriptions({
      id: subscription.id,
      shipping_address_snapshot: parsed.data.shipping_address,
      billing_address_snapshot: parsed.data.billing_address || parsed.data.shipping_address,
    })
    return res.json({ subscription: updated })
  } catch (error: any) {
    console.error(`[Subscriptions] address update failed: ${error?.code || "SUBSCRIPTION_ADDRESS_FAILED"}`)
    return res.status(500).json({ code: "SUBSCRIPTION_ADDRESS_FAILED", message: "Unable to update subscription address." })
  }
}

