import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { getStripeClient } from "../../../lib/stripe-client"
import { SUBSCRIPTION_MODULE } from "../../../modules/subscription"
import {
  calculateSubscriptionUnitPrice,
  createSubscriptionFingerprint,
  INTERVAL_TO_PLAN,
  SUBSCRIPTION_INTERVALS,
  type SubscriptionInterval,
} from "../../../modules/subscription/contract"

const CreateSubscriptionSchema = z.object({
  cart_id: z.string().trim().min(1).max(128),
  interval: z.enum(SUBSCRIPTION_INTERVALS),
  interval_count: z.number().int().min(1).max(12),
  idempotency_key: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/),
}).strict()

function publicSubscription(subscription: any) {
  const { stripe_payment_method_id: _paymentMethod, ...safe } = subscription || {}
  return safe
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id as string | undefined
  if (!customerId) return res.status(401).json({ code: "SUBSCRIPTION_AUTH_REQUIRED", message: "Authentication required." })

  const service: any = req.scope.resolve(SUBSCRIPTION_MODULE)
  const subscriptions = await service.listSubscriptions(
    { customer_id: customerId },
    { order: { created_at: "DESC" } }
  )
  return res.json({ subscriptions: subscriptions.map(publicSubscription), count: subscriptions.length })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id as string | undefined
  if (!customerId) return res.status(401).json({ code: "SUBSCRIPTION_AUTH_REQUIRED", message: "Authentication required." })

  const parsed = CreateSubscriptionSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ code: "SUBSCRIPTION_INPUT_INVALID", message: "Invalid subscription request.", issues: parsed.error.issues })
  }

  const { cart_id: cartId, interval, interval_count: intervalCount, idempotency_key: idempotencyKey } = parsed.data
  const service: any = req.scope.resolve(SUBSCRIPTION_MODULE)
  const fingerprint = createSubscriptionFingerprint({ customerId, cartId, interval, intervalCount })
  const existing = (await service.listSubscriptions({ customer_id: customerId, idempotency_key: idempotencyKey }))[0]
  if (existing) {
    if (existing.input_fingerprint !== fingerprint) {
      return res.status(409).json({ code: "SUBSCRIPTION_IDEMPOTENCY_CONFLICT", message: "The idempotency key was already used for different input." })
    }
    return res.status(200).json({ subscription: publicSubscription(existing), reused: true })
  }

  if (!process.env.STRIPE_API_KEY) {
    return res.status(503).json({ code: "SUBSCRIPTION_PAYMENT_UNAVAILABLE", message: "Subscription checkout is unavailable." })
  }

  try {
    const cartService: any = req.scope.resolve(Modules.CART)
    const customerService: any = req.scope.resolve(Modules.CUSTOMER)
    const cart = await cartService.retrieveCart(cartId, {
      relations: ["items", "items.variant", "shipping_address", "billing_address"],
    })

    if (!cart || cart.customer_id !== customerId) {
      return res.status(404).json({ code: "SUBSCRIPTION_CART_NOT_FOUND", message: "Cart not found." })
    }
    if (cart.completed_at) return res.status(409).json({ code: "SUBSCRIPTION_CART_COMPLETED", message: "The cart is already completed." })
    if (!cart.region_id || !cart.currency_code || !Array.isArray(cart.items) || !cart.items.length) {
      return res.status(400).json({ code: "SUBSCRIPTION_CART_INVALID", message: "The cart is not ready for subscription checkout." })
    }
    if (cart.items.some((item: any) => item.metadata?.personalization_id || item.metadata?.bundle_id || item.metadata?.is_bundle)) {
      return res.status(400).json({ code: "SUBSCRIPTION_MIXED_CART_UNSUPPORTED", message: "Subscription checkout supports subscription items only." })
    }
    if (cart.items.some((item: any) => item.metadata?.is_subscription !== true)) {
      return res.status(400).json({ code: "SUBSCRIPTION_MIXED_CART_UNSUPPORTED", message: "Subscription checkout supports subscription items only." })
    }
    if (cart.items.some((item: any) => String(item.metadata?.subscription_interval || "").toUpperCase() !== interval)) {
      return res.status(400).json({ code: "SUBSCRIPTION_INTERVAL_MISMATCH", message: "Cart subscription interval does not match the request." })
    }

    const itemSnapshots: any[] = []
    let amount = 0
    let pauseAllowed = true
    for (const item of cart.items) {
      const variantId = String(item.variant_id || item.variant?.id || "")
      const productId = String(item.product_id || item.variant?.product_id || "")
      const configs = await service.listSubscriptionProductConfigurations({
        enabled: true,
        product_id_reference: productId,
      })
      const config = configs.find((entry: any) => !entry.variant_id_reference || entry.variant_id_reference === variantId)
      const allowed = Array.isArray(config?.allowed_intervals) ? config.allowed_intervals.map((value: unknown) => String(value).toUpperCase()) : []
      if (!config || !allowed.includes(interval)) {
        return res.status(400).json({ code: "SUBSCRIPTION_ITEM_INELIGIBLE", message: "A cart item is not eligible for the selected subscription interval.", variant_id: variantId })
      }
      pauseAllowed = pauseAllowed && config.pause_allowed !== false
      const quantity = Number(item.quantity)
      const sourcePrice = Number(item.unit_price)
      if (!variantId || !Number.isInteger(quantity) || quantity < 1 || !Number.isInteger(sourcePrice) || sourcePrice < 0) {
        return res.status(400).json({ code: "SUBSCRIPTION_CART_PRICE_INVALID", message: "A cart item has no valid server-calculated price." })
      }
      const unitPrice = calculateSubscriptionUnitPrice(sourcePrice, config)
      amount += unitPrice * quantity
      itemSnapshots.push({
        variant_id_reference: variantId,
        product_id_reference: productId || null,
        quantity,
        unit_price_snapshot: unitPrice,
        title_snapshot: String(item.title || "Subscription item"),
        variant_title_snapshot: item.variant_title ? String(item.variant_title) : null,
        metadata: { source_cart_item_id: item.id, configuration_id: config.id },
      })
    }

    const customer = await customerService.retrieveCustomer(customerId)
    const subscription = await service.createSubscriptions({
      customer_id: customerId,
      customer_email: customer.email,
      idempotency_key: idempotencyKey,
      input_fingerprint: fingerprint,
      plan: INTERVAL_TO_PLAN[interval as SubscriptionInterval],
      interval_count: intervalCount,
      status: "draft",
      amount,
      currency: String(cart.currency_code).toLowerCase(),
      region_id_reference: cart.region_id,
      sales_channel_id_reference: cart.sales_channel_id || null,
      shipping_address_snapshot: cart.shipping_address || null,
      billing_address_snapshot: cart.billing_address || null,
      payment_provider: "stripe_billing",
      metadata: { source_cart_id: cartId, interval, item_count: itemSnapshots.length, pause_allowed: pauseAllowed },
    })

    await service.createSubscriptionItems(itemSnapshots.map((item) => ({ ...item, subscription_id: subscription.id })))
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173"
    const session = await getStripeClient().checkout.sessions.create({
      mode: "subscription",
      customer_email: customer.email || undefined,
      line_items: itemSnapshots.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: String(cart.currency_code).toLowerCase(),
          unit_amount: item.unit_price_snapshot,
          product_data: { name: item.variant_title_snapshot ? `${item.title_snapshot} — ${item.variant_title_snapshot}` : item.title_snapshot },
          recurring: {
            interval: interval === "WEEK" ? "week" : interval === "YEAR" ? "year" : "month",
            interval_count: interval === "QUARTER" ? intervalCount * 3 : intervalCount,
          },
        },
      })),
      metadata: { subscription_id: subscription.id, customer_id: customerId, cart_id: cartId },
      subscription_data: { metadata: { subscription_id: subscription.id, customer_id: customerId } },
      success_url: `${frontendUrl}/dashboard/subscriptions?created=true`,
      cancel_url: `${frontendUrl}/cart?subscription_canceled=true`,
    }, { idempotencyKey: `subscription:create:${customerId}:${idempotencyKey}` })

    await service.updateSubscriptions({
      id: subscription.id,
      stripe_subscription_id: session.id,
      metadata: { ...(subscription.metadata || {}), checkout_session_id: session.id },
    })
    return res.status(201).json({ subscription: publicSubscription(subscription), checkout_url: session.url, reused: false })
  } catch (error: any) {
    console.error(`[Subscriptions] create failed: ${error?.code || "SUBSCRIPTION_CREATE_FAILED"}`)
    return res.status(500).json({ code: "SUBSCRIPTION_CREATE_FAILED", message: "Unable to create subscription checkout." })
  }
}
