import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import Stripe from "stripe"
import { SUBSCRIPTION_MODULE } from "../../../../modules/subscription"

const stripe = new Stripe(process.env.STRIPE_API_KEY || "", { apiVersion: "2025-05-28.basil" as any })
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ""

type PaymentEventPayload = {
  provider: string
  event: string
  payment_id: string
  subscription_id?: string
  customer_id?: string
  amount?: number
  currency?: string
  status: "succeeded" | "failed"
  error?: string
  metadata?: Record<string, unknown>
}

type SubscriptionUpdate = {
  id: string
  status?: string
  failed_payment_count?: number
  last_billed_at?: Date
  next_billing_date?: Date
  stripe_payment_intent_id?: string
  metadata?: Record<string, unknown>
}

// ─── Stripe Event Handlers ─────────────────────────────────────────────────

function isStripePayload(body: unknown): body is { type: string; data: { object: Record<string, any> } } {
  return typeof body === "object" && body !== null && "type" in body && "data" in body
}

async function handleStripeEvent(
  event: { type: string; data: { object: Record<string, any> } },
  subscriptionService: any
): Promise<{ received: boolean; type: string; subscription_id?: string }> {
  const object = event.data.object

  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = object
      const subId = pi.metadata?.subscription_id
      console.log(`[Subscription Payment Webhook] payment_intent.succeeded: ${pi.id} (sub: ${subId})`)

      if (subId) {
        const planDays: Record<string, number> = { weekly: 7, monthly: 30, quarterly: 90, yearly: 365 }
        const sub = await subscriptionService.retrieveSubscription(subId)
        const nextDate = new Date()
        nextDate.setDate(nextDate.getDate() + (planDays[sub?.plan] || 30))

        await subscriptionService.updateSubscriptions({
          id: subId,
          status: "active",
          failed_payment_count: 0,
          last_billed_at: new Date(),
          next_billing_date: nextDate,
          stripe_payment_intent_id: pi.id,
        } as SubscriptionUpdate)

        console.log(`[Subscription Payment Webhook] Subscription ${subId} renewed, next billing: ${nextDate.toISOString()}`)
      }

      return { received: true, type: event.type, subscription_id: subId }
    }

    case "payment_intent.payment_failed": {
      const pi = object
      const subId = pi.metadata?.subscription_id
      console.error(`[Subscription Payment Webhook] payment_intent.payment_failed: ${pi.id} (sub: ${subId})`)

      if (subId) {
        const sub = await subscriptionService.retrieveSubscription(subId)
        const failCount = (sub?.failed_payment_count || 0) + 1
        const newStatus = failCount >= 3 ? "expired" : "past_due"
        const outcome = pi.last_payment_error?.decline_code || pi.outcome?.type || "generic_decline"

        await subscriptionService.updateSubscriptions({
          id: subId,
          status: newStatus,
          failed_payment_count: failCount,
          metadata: { ...(sub?.metadata || {}), last_failure_reason: outcome, last_failure_at: new Date().toISOString() },
        } as SubscriptionUpdate)

        console.log(`[Subscription Payment Webhook] ${subId} → ${newStatus} (${failCount}/3 failures, reason: ${outcome})`)
      }

      return { received: true, type: event.type, subscription_id: subId }
    }

    case "charge.refunded": {
      const charge = object
      const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id
      console.log(`[Subscription Payment Webhook] charge.refunded: ${charge.id}`)

      if (piId) {
        try {
          const pi = await stripe.paymentIntents.retrieve(piId)
          const subId = pi.metadata?.subscription_id
          if (subId) {
            await subscriptionService.updateSubscriptions({
              id: subId,
              status: "cancelled",
            } as SubscriptionUpdate)
            console.log(`[Subscription Payment Webhook] Subscription ${subId} cancelled due to refund`)
            return { received: true, type: event.type, subscription_id: subId }
          }
        } catch (err: any) {
          console.error(`[Subscription Payment Webhook] Failed to process refund for charge ${charge.id}:`, err.message)
        }
      }
      return { received: true, type: event.type }
    }

    case "customer.subscription.deleted":
    case "customer.subscription.updated": {
      const sub = object
      const [localSub] = await subscriptionService.listSubscriptions({
        stripe_subscription_id: sub.id,
      })

      if (localSub) {
        if (event.type === "customer.subscription.deleted") {
          await subscriptionService.updateSubscriptions({
            id: localSub.id,
            status: "cancelled",
          } as SubscriptionUpdate)
          console.log(`[Subscription Payment Webhook] Stripe sub ${sub.id} deleted, local ${localSub.id} → cancelled`)
        } else {
          const statusMap: Record<string, string> = {
            active: "active",
            trialing: "trialing",
            past_due: "past_due",
            canceled: "cancelled",
            unpaid: "past_due",
            incomplete: "past_due",
            incomplete_expired: "expired",
          }
          const localStatus = statusMap[sub.status] || localSub.status
          const nextBilling = sub.current_period_end
            ? new Date(sub.current_period_end * 1000)
            : localSub.next_billing_date

          await subscriptionService.updateSubscriptions({
            id: localSub.id,
            status: localStatus,
            next_billing_date: nextBilling,
            metadata: { ...(localSub.metadata || {}), stripe_subscription_item_id: sub.items?.data?.[0]?.id },
          } as SubscriptionUpdate)
          console.log(`[Subscription Payment Webhook] Stripe sub ${sub.id} → ${localStatus}`)
        }
      }

      return { received: true, type: event.type, subscription_id: localSub?.id }
    }

    default: {
      console.log(`[Subscription Payment Webhook] Unhandled Stripe event type: ${event.type}`)
      return { received: true, type: event.type }
    }
  }
}

// ─── Generic Provider Event Handler ────────────────────────────────────────

async function handleProviderEvent(
  payload: PaymentEventPayload,
  subscriptionService: any
): Promise<{ received: boolean; subscription_id?: string }> {
  if (!payload.subscription_id) {
    console.warn(`[Subscription Payment Webhook] No subscription_id in payload from ${payload.provider}`)
    return { received: false }
  }

  if (payload.status === "succeeded") {
    const planDays: Record<string, number> = { weekly: 7, monthly: 30, quarterly: 90, yearly: 365 }
    const sub = await subscriptionService.retrieveSubscription(payload.subscription_id)
    const nextDate = new Date()
    nextDate.setDate(nextDate.getDate() + (planDays[sub?.plan] || 30))

    await subscriptionService.updateSubscriptions({
      id: payload.subscription_id,
      status: "active",
      failed_payment_count: 0,
      last_billed_at: new Date(),
      next_billing_date: nextDate,
    } as SubscriptionUpdate)

    console.log(`[Subscription Payment Webhook] ${payload.provider} payment succeeded for ${payload.subscription_id}`)
    return { received: true, subscription_id: payload.subscription_id }
  }

  // Payment failed
  const sub = await subscriptionService.retrieveSubscription(payload.subscription_id)
  const failCount = (sub?.failed_payment_count || 0) + 1
  const newStatus = failCount >= 3 ? "expired" : "past_due"

  await subscriptionService.updateSubscriptions({
    id: payload.subscription_id,
    status: newStatus,
    failed_payment_count: failCount,
    metadata: { ...(sub?.metadata || {}), last_failure_reason: payload.error || "unknown", last_failure_at: new Date().toISOString() },
  } as SubscriptionUpdate)

  console.log(`[Subscription Payment Webhook] ${payload.provider} payment failed for ${payload.subscription_id} → ${newStatus} (${failCount}/3)`)
  return { received: true, subscription_id: payload.subscription_id }
}

// ─── POST Handler ──────────────────────────────────────────────────────────

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const subscriptionService: any = req.scope.resolve(SUBSCRIPTION_MODULE)

  try {
    // ── Detect Stripe webhook ──────────────────────────────────────────
    const sig = req.headers["stripe-signature"] as string | undefined
    const isStripe = !!sig || isStripePayload(req.body)

    if (isStripe) {
      let event: { type: string; data: { object: Record<string, any> } }

      try {
        const rawBody = (req as any).rawBody || JSON.stringify(req.body)
        if (sig && webhookSecret && webhookSecret !== "whsec_test") {
          event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret) as any
        } else {
          if (process.env.NODE_ENV !== "development") {
            console.warn("[Subscription Payment Webhook] Stripe signature verification skipped (dev mode)")
          }
          event = typeof req.body === "string" ? JSON.parse(req.body) : (req.body as any)
        }
      } catch (err: any) {
        console.error("[Subscription Payment Webhook] Stripe signature verification failed:", err.message)
        return res.status(400).json({ message: `Stripe webhook signature verification failed: ${err.message}` })
      }

      const result = await handleStripeEvent(event, subscriptionService)
      return res.json(result)
    }

    // ── Generic provider payload ───────────────────────────────────────
    const payload = req.body as PaymentEventPayload

    if (!payload.provider || !payload.event || !payload.status) {
      return res.status(400).json({
        message: "Invalid payload. Required: provider, event, status",
      })
    }

    const result = await handleProviderEvent(payload, subscriptionService)
    return res.json(result)

  } catch (error: any) {
    console.error("[Subscription Payment Webhook] Unhandled error:", error)
    return res.status(500).json({ message: "Webhook handler error" })
  }
}
