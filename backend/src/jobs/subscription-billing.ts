import { createStep, createWorkflow, StepResponse } from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"
import { MedusaContainer } from "@medusajs/framework/types"
import Stripe from "stripe"
import { SUBSCRIPTION_MODULE } from "../modules/subscription"

const stripe = new Stripe(process.env.STRIPE_API_KEY || "", {
  apiVersion: "2025-05-28.basil" as any,
})

const PLAN_DAYS: Record<string, number> = { weekly: 7, monthly: 30, quarterly: 90, yearly: 365 }

// ─── Step 1: Attempt Stripe off-session charge ─────────────────────────────
const chargeSubscriptionStep = (createStep as any)(
  "charge-subscription",
  async (sub: any, { container }: any) => {
    const subscriptionService: any = container.resolve(SUBSCRIPTION_MODULE)
    const eventBus: any = container.resolve(Modules.EVENT_BUS)
    const compData = {
      subscriptionId: sub.id,
      previousStatus: sub.status,
      previousFailedCount: sub.failed_payment_count,
    }

    if (!sub.stripe_customer_id || !sub.stripe_payment_method_id) {
      console.warn(
        `[Subscription Billing] ${sub.id}: No Stripe method set, skipping charge`
      )
      return new StepResponse(
        { success: false, subscription: sub, paymentIntent: null, skipped: true },
        compData
      )
    }

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: sub.amount,
        currency: sub.currency || "usd",
        customer: sub.stripe_customer_id,
        payment_method: sub.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        metadata: { subscription_id: sub.id, renewal: "true" },
      })

      if (paymentIntent.status !== "succeeded") {
        throw new Error(
          `Stripe payment ${paymentIntent.id} status: ${paymentIntent.status}`
        )
      }

      console.log(`[Subscription Billing] Charged ${sub.id}: PI ${paymentIntent.id}`)
      return new StepResponse(
        { success: true, subscription: sub, paymentIntent, skipped: false },
        compData
      )
    } catch (err: any) {
      const newFailCount = (sub.failed_payment_count || 0) + 1
      const newStatus = newFailCount >= 3 ? "expired" : "past_due"

      await subscriptionService.updateSubscriptions({
        id: sub.id,
        status: newStatus,
        failed_payment_count: newFailCount,
        metadata: {
          ...(sub.metadata || {}),
          last_failure_reason: err.message,
          last_failure_at: new Date().toISOString(),
        },
      })

      await eventBus.emit({
        name: "payment.failed",
        data: {
          id: sub.id,
          customer_email: sub.customer_email,
          attempt: newFailCount,
          error: err.message,
        },
      })

      if (newStatus === "expired") {
        await eventBus.emit({
          name: "subscription.cancelled",
          data: {
            id: sub.id,
            customer_email: sub.customer_email,
            reason: "Payment failed 3 times",
          },
        })
      }

      console.log(
        `[Subscription Billing] Charge failed for ${sub.id} → ${newStatus} (${newFailCount}/3): ${err.message}`
      )
      return new StepResponse(
        {
          success: false,
          subscription: {
            ...sub,
            status: newStatus,
            failed_payment_count: newFailCount,
          },
          paymentIntent: null,
          skipped: false,
        },
        compData
      )
    }
  },
  async (compData: any, { container }: any) => {
    if (!compData?.subscriptionId) return
    const subscriptionService: any = container.resolve(SUBSCRIPTION_MODULE)
    await subscriptionService.updateSubscriptions({
      id: compData.subscriptionId,
      status: compData.previousStatus,
      failed_payment_count: compData.previousFailedCount,
    })
  }
)

// ─── Step 2: Create renewal order (skipped on failed charge) ──────────────
const createRenewalOrderStep = createStep(
  "create-renewal-order",
  async (chargeResult: any, { container }: any) => {
    const { success, subscription, paymentIntent, skipped } = chargeResult
    if (!success || skipped || !paymentIntent) {
      return new StepResponse({ orderId: null, subscriptionId: subscription.id })
    }

    const orderModuleService: any = container.resolve(Modules.ORDER)
    const origMeta = subscription.metadata || {}

    const order = await orderModuleService.createOrders({
      email: subscription.customer_email,
      currency_code: subscription.currency,
      region_id: origMeta.region_id,
      shipping_address: origMeta.shipping_address,
      billing_address: origMeta.billing_address,
      items: [
        {
          title: subscription.product_title || "Subscription Box Renewal",
          quantity: 1,
          unit_price: subscription.amount,
          variant_id: origMeta.variant_id,
          product_id: subscription.product_id,
          metadata: { subscription_id: subscription.id, is_renewal: true },
        },
      ],
      metadata: {
        subscription_id: subscription.id,
        is_renewal: true,
        stripe_payment_intent_id: paymentIntent.id,
      },
    })

    return new StepResponse(
      { orderId: order.id, subscriptionId: subscription.id },
      { orderId: order.id, subscriptionId: subscription.id }
    )
  },
  async (compData: any, { container }: any) => {
    if (!compData?.orderId) return
    try {
      const orderModuleService: any = container.resolve(Modules.ORDER)
      await orderModuleService.cancelOrder(compData.orderId)
    } catch {
      /* order may not exist */
    }
  }
)

// ─── Step 3: Advance billing period (skipped on failed charge) ────────────
const advanceBillingPeriodStep = createStep(
  "advance-billing-period",
  async (
    {
      orderId,
      subscriptionId,
    }: { orderId: string | null; subscriptionId: string },
    { container }: any
  ) => {
    if (!orderId) {
      return new StepResponse({ subscriptionId, skipped: true })
    }

    const subscriptionService: any = container.resolve(SUBSCRIPTION_MODULE)
    const eventBus: any = container.resolve(Modules.EVENT_BUS)
    const sub = await subscriptionService.retrieveSubscription(subscriptionId)

    const nextDate = new Date()
    nextDate.setDate(nextDate.getDate() + (PLAN_DAYS[sub.plan] || 30))

    await subscriptionService.updateSubscriptions({
      id: subscriptionId,
      next_billing_date: nextDate,
      last_billed_at: new Date(),
      failed_payment_count: 0,
      status: "active",
    })

    await eventBus.emit({
      name: "subscription.renewed",
      data: {
        id: subscriptionId,
        customer_email: sub.customer_email,
        order_id: orderId,
      },
    })

    return new StepResponse(
      { subscriptionId, nextBillingDate: nextDate, skipped: false },
      {
        subscriptionId,
        originalNextBilling: sub.next_billing_date,
        originalLastBilled: sub.last_billed_at,
        originalFailedCount: sub.failed_payment_count,
        originalStatus: sub.status,
      }
    )
  },
  async (compData: any, { container }: any) => {
    if (!compData?.subscriptionId) return
    const subscriptionService: any = container.resolve(SUBSCRIPTION_MODULE)
    await subscriptionService.updateSubscriptions({
      id: compData.subscriptionId,
      next_billing_date: compData.originalNextBilling,
      last_billed_at: compData.originalLastBilled,
      failed_payment_count: compData.originalFailedCount,
      status: compData.originalStatus,
    })
  }
)

// ─── Workflow: Bill a single subscription ──────────────────────────────────
const billSingleSubscriptionWorkflow = createWorkflow(
  "bill-single-subscription",
  (sub: any) => {
    const charge = chargeSubscriptionStep(sub)
    const order = createRenewalOrderStep(charge)
    advanceBillingPeriodStep({
      orderId: order.orderId,
      subscriptionId: order.subscriptionId,
    })
  }
) as any

// ─── Scheduled Job Entry Point ─────────────────────────────────────────────
export default async function subscriptionBillingJob(container: MedusaContainer) {
  const subscriptionService: any = container.resolve(SUBSCRIPTION_MODULE)
  const customerModuleService: any = container.resolve(Modules.CUSTOMER)

  // ── 1. Fetch subscriptions due for billing ────────────────────────────
  //     Safe structural unwrapping: the module query may return a flat
  //     array or a nested { data: [...] } envelope depending on the
  //     Medusa version and query path used.
  let dueSubscriptions: any

  try {
    dueSubscriptions = await subscriptionService.listSubscriptions({
      status: ["active", "past_due"],
    })
  } catch (err: any) {
    console.error(`[Subscription Billing Job] Failed to query subscriptions: ${err.message}`)
    return
  }

  // Safe unwrap: handle both raw array and { data: [...] } envelope
  const subscriptionsList = Array.isArray(dueSubscriptions)
    ? dueSubscriptions
    : (dueSubscriptions?.data as any[]) || []

  // ── 2. Guard clause: exit early if nothing to bill ────────────────────
  if (!subscriptionsList.length) {
    console.log("[Subscription Billing Job] No subscriptions due for billing.")
    return
  }

  // Filter to only those past their next_billing_date
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  const dueNow = subscriptionsList.filter((sub: any) => {
    if (!sub.next_billing_date) return false
    return new Date(sub.next_billing_date) <= now
  })

  if (!dueNow.length) {
    console.log("[Subscription Billing Job] No subscriptions past their billing date.")
    return
  }

  console.log(
    `[Subscription Billing Job] ${dueNow.length} subscription(s) due for billing`
  )

  // ── 3. Process each due subscription individually ─────────────────────
  //     Using for...of here is safe because dueNow is a concrete array
  //     resolved at runtime, not a workflow step descriptor.
  const errors: Array<{ subscriptionId: string; error: string }> = []

  for (const sub of dueNow) {
    let chargeFailed = false

    try {
      const workflow = billSingleSubscriptionWorkflow(container)
      const { errors: workflowErrors } = await workflow.run({
        input: sub,
      })

      if (workflowErrors.length > 0) {
        chargeFailed = true
        errors.push({
          subscriptionId: sub.id,
          error: workflowErrors[0]?.error?.message || String(workflowErrors[0]?.error),
        })
      }
    } catch (err: any) {
      chargeFailed = true
      errors.push({ subscriptionId: sub.id, error: err.message })
      console.error(`[Subscription Billing Job] Failed to bill ${sub.id}: ${err.message}`)
    }

    // ── Premium membership metadata update ────────────────────────────
    //     If the subscription charge fails, downgrade the customer's
    //     premium status in their metadata so the frontend can reflect
    //     the loss of "Fast Delivery" and other perks.
    if (chargeFailed && sub.customer_id) {
      try {
        // Fetch current customer to merge existing metadata
        const customer = await customerModuleService.retrieveCustomer(sub.customer_id)
        const existingMetadata = customer?.metadata || {}

        await customerModuleService.updateCustomers({
          id: sub.customer_id,
          metadata: {
            ...existingMetadata,
            is_premium: false,
            premium_downgraded_at: new Date().toISOString(),
            premium_downgrade_reason: "payment_failed",
          },
        })

        console.log(
          `[Subscription Billing] Updated customer ${sub.customer_id} metadata: is_premium=false (payment failed)`
        )
      } catch (metaErr: any) {
        console.error(
          `[Subscription Billing] Failed to update customer metadata for ${sub.customer_id}: ${metaErr.message}`
        )
      }
    }
  }

  // ── 4. Report results ────────────────────────────────────────────────
  const succeeded = dueNow.length - errors.length
  console.log(
    `[Subscription Billing Job] Complete: ${succeeded} succeeded, ${errors.length} failed`
  )

  if (errors.length > 0) {
    for (const e of errors) {
      console.error(`  - ${e.subscriptionId}: ${e.error}`)
    }
  }
}

export const config = {
  name: "subscription-billing",
  schedule: "0 4 * * *",
}
