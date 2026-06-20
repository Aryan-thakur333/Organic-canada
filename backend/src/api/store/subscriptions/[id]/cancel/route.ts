import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules, MedusaError } from "@medusajs/framework/utils"
import Stripe from "stripe"
import { SUBSCRIPTION_MODULE } from "../../../../../modules/subscription"

// ── Helpers ────────────────────────────────────────────────────────────────

function getStripe() {
  return new Stripe(process.env.STRIPE_API_KEY || "", {
    apiVersion: "2025-05-28.basil" as any,
  })
}

/**
 * Downgrades the customer's premium metadata so frontend perks are revoked.
 * Merges with existing metadata to avoid data loss.
 */
async function revokeCustomerPremiumStatus(
  scope: any,
  customerId: string
): Promise<void> {
  const customerModuleService: any = scope.resolve(Modules.CUSTOMER)
  const customer = await customerModuleService.retrieveCustomer(customerId)
  const existingMetadata = customer?.metadata || {}

  await customerModuleService.updateCustomers({
    id: customerId,
    metadata: {
      ...existingMetadata,
      is_premium: false,
      premium_cancelled_at: new Date().toISOString(),
    },
  })
}

// ────────────────────────────────────────────────────────────────────────────
//  POST /store/subscriptions/:id/cancel
//
//  Flow:
//    1. Authenticate customer via session
//    2. Resolve subscription record & verify ownership
//    3. Cancel the recurring Stripe subscription (if linked) to stop invoices
//    4. Update local DB record → status: "cancelled"
//    5. Downgrade customer premium metadata → is_premium: false
//    6. Emit `subscription.cancelled` event for downstream subscribers
//    7. Return updated subscription object (200 OK)
// ────────────────────────────────────────────────────────────────────────────
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const customer_id = (req as any).auth_context?.actor_id

  if (!customer_id) {
    return res.status(401).json({ message: "Authentication required" })
  }

  try {
    // ── 1. Resolve subscription & verify ownership ───────────────────────
    const subscriptionService: any = req.scope.resolve(SUBSCRIPTION_MODULE)

    const subscription = await subscriptionService.retrieveSubscription(id)
    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found" })
    }
    if (subscription.customer_id !== customer_id) {
      return res.status(403).json({ message: "Forbidden" })
    }

    // ── 2. Cancel the Stripe recurring subscription if it exists ─────────
    //     This immediately stops the recurring invoice cycle for this
    //     customer so they are not billed again after cancellation.
    if (subscription.stripe_subscription_id) {
      try {
        const stripe = getStripe()
        await stripe.subscriptions.cancel(subscription.stripe_subscription_id)

        console.log(
          `[Cancel Subscription] Stripe sub ${subscription.stripe_subscription_id} cancelled for customer ${customer_id}`
        )
      } catch (stripeError: any) {
        // Log but don't block — the local cancellation should still proceed.
        // Stripe may throw if the subscription was already cancelled/expired.
        console.warn(
          `[Cancel Subscription] Stripe cancellation warning for sub ${subscription.stripe_subscription_id}: ${stripeError.message}`
        )
      }
    } else {
      console.log(
        `[Cancel Subscription] No Stripe subscription linked for local sub ${id} — skipping Stripe cancellation`
      )
    }

    // ── 3. Update local subscription record ───────────────────────────────
    const updated = await subscriptionService.updateSubscriptions({
      id,
      status: "cancelled",
      next_billing_date: null,
    })

    // ── 4. Downgrade customer premium metadata ───────────────────────────
    await revokeCustomerPremiumStatus(req.scope, customer_id)

    // ── 5. Emit cancellation event for downstream subscribers ────────────
    //     The `subscription-cancelled` subscriber handles logging and can be
    //     extended to send cancellation confirmation emails.
    const eventBus: any = req.scope.resolve(Modules.EVENT_BUS)
    await eventBus.emit({
      name: "subscription.cancelled",
      data: {
        id: subscription.id,
        customer_email: subscription.customer_email,
        reason: "User requested cancellation",
      },
    })

    console.log(
      `[Cancel Subscription] Local subscription ${id} cancelled for customer ${customer_id}`
    )

    return res.json({ subscription: updated })
  } catch (error: any) {
    console.error("[Cancel Subscription] Error:", error)

    if (error instanceof MedusaError) {
      const status = error.type === "not_found" ? 404 : 400
      return res.status(status).json({ message: error.message })
    }

    return res.status(500).json({ message: error.message || "Failed to cancel subscription" })
  }
}
