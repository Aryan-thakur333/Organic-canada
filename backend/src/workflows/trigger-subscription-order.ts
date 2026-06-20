import {
  createWorkflow,
  createStep,
  WorkflowResponse,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"
import { Modules } from "@medusajs/framework/utils"
import { SUBSCRIPTION_MODULE } from "../modules/subscription"

// ── Types ──────────────────────────────────────────────────────────────────

export type TriggerSubscriptionOrderInput = {
  /** ISO date string to check against (defaults to today) */
  billing_date?: string
  /** Optional dry-run — logs what would happen without executing */
  dry_run?: boolean
}

export type TriggerSubscriptionOrderOutput = {
  processed: number
  skipped: number
  errors: Array<{ subscription_id: string; error: string }>
  results: Array<{
    subscription_id: string
    order_id?: string
    next_billing_date: string
    status: string
  }>
}

// ── Helpers ────────────────────────────────────────────────────────────────

const PLAN_DAYS: Record<string, number> = {
  weekly: 7,
  monthly: 30,
  quarterly: 90,
  yearly: 365,
}

function computeNextBillingDate(plan: string, from: Date = new Date()): Date {
  const days = PLAN_DAYS[plan] ?? 30
  const next = new Date(from)
  next.setDate(next.getDate() + days)
  return next
}

// ── Step 1: Fetch due subscriptions ───────────────────────────────────────

export const fetchDueSubscriptionsStep = createStep(
  "fetch-due-subscriptions",
  async (
    { billing_date }: { billing_date: string },
    { container }
  ) => {
    const subscriptionService: any = container.resolve(SUBSCRIPTION_MODULE)

    const targetDate = billing_date ? new Date(billing_date) : new Date()
    targetDate.setHours(0, 0, 0, 0)

    const subscriptions = await subscriptionService.listSubscriptions({
      status: "active",
    })

    const dueSubscriptions = subscriptions.filter((sub: any) => {
      if (!sub.next_billing_date) return false
      const billing = new Date(sub.next_billing_date)
      billing.setHours(0, 0, 0, 0)
      return billing <= targetDate
    })

    console.log(
      `[TriggerSubscriptionOrder] Found ${dueSubscriptions.length} active subscriptions due on or before ${targetDate.toISOString().split("T")[0]}`
    )

    // Return the filtered list so step 2 can use it directly
    return new StepResponse(dueSubscriptions)
  },
  // Compensate: read-only step — nothing to undo
  async () => {}
)

// ── Step 2: Generate orders for each due subscription ─────────────────────

type GenerateOrdersStepInput = {
  subscriptions: any[]
  dry_run?: boolean
  billing_date?: string
}

export const generateSubscriptionOrdersStep = createStep(
  "generate-subscription-orders",
  async (
    { subscriptions, dry_run }: GenerateOrdersStepInput,
    { container }
  ) => {
    const subscriptionService: any = container.resolve(SUBSCRIPTION_MODULE)
    const orderModuleService: any = container.resolve(Modules.ORDER)
    const eventBus: any = container.resolve(Modules.EVENT_BUS)

    const result: TriggerSubscriptionOrderOutput = {
      processed: 0,
      skipped: 0,
      errors: [],
      results: [],
    }

    for (const sub of subscriptions) {
      try {
        if (dry_run) {
          console.log(
            `[TriggerSubscriptionOrder][DryRun] Would generate order for subscription ${sub.id} (${sub.customer_email})`
          )
          result.skipped++
          result.results.push({
            subscription_id: sub.id,
            next_billing_date: computeNextBillingDate(sub.plan).toISOString(),
            status: "dry_run",
          })
          continue
        }

        const origMeta = sub.metadata || {}

        // Create the order in Medusa core
        const newOrder = await orderModuleService.createOrders({
          email: sub.customer_email,
          currency_code: sub.currency || "usd",
          region_id: origMeta.region_id,
          shipping_address: origMeta.shipping_address,
          billing_address: origMeta.billing_address,
          items: [
            {
              title: sub.product_title || "Subscription Renewal",
              quantity: 1,
              unit_price: sub.amount,
              variant_id: origMeta.variant_id,
              product_id: sub.product_id,
              metadata: {
                subscription_id: sub.id,
                is_renewal: true,
              },
            },
          ],
          metadata: {
            subscription_id: sub.id,
            is_renewal: true,
          },
        })

        // Compute and persist next billing cycle
        const nextBilling = computeNextBillingDate(sub.plan)

        await subscriptionService.updateSubscriptions({
          id: sub.id,
          next_billing_date: nextBilling,
          last_billed_at: new Date(),
          failed_payment_count: 0,
          status: "active",
        })

        console.log(
          `[TriggerSubscriptionOrder] Created order ${newOrder.id} for subscription ${sub.id}. Next billing: ${nextBilling.toISOString().split("T")[0]}`
        )

        // Emit renewal event for downstream subscribers
        await eventBus.emit({
          name: "subscription.renewed",
          data: {
            id: sub.id,
            order_id: newOrder.id,
            customer_email: sub.customer_email,
          },
        })

        result.processed++
        result.results.push({
          subscription_id: sub.id,
          order_id: newOrder.id,
          next_billing_date: nextBilling.toISOString(),
          status: "order_created",
        })
      } catch (error: any) {
        console.error(
          `[TriggerSubscriptionOrder] Failed for subscription ${sub.id}:`,
          error.message
        )
        result.errors.push({
          subscription_id: sub.id,
          error: error.message,
        })
      }
    }

    return new StepResponse(result, {
      processed_ids: result.results.map((r) => r.subscription_id),
    })
  },
  // Compensate: log that created orders may need to be rolled back
  async (compensationData: { processed_ids: string[] } | undefined) => {
    if (!compensationData?.processed_ids?.length) return
    console.log(
      `[TriggerSubscriptionOrder][Compensate] Rolling back order creation for ${compensationData.processed_ids.length} subscriptions`
    )
  }
)

// ── Workflow ───────────────────────────────────────────────────────────────

/**
 * Trigger Subscription Order Workflow
 *
 * 1. Fetches all active subscriptions due on or before the target date
 * 2. Generates a Medusa Order for each due subscription
 * 3. Advances next_billing_date to the next interval cycle
 * 4. Emits subscription.renewed events
 *
 * Designed to be triggered by a scheduled job or admin API route:
 *
 * ```ts
 * const { result } = await triggerSubscriptionOrderWorkflow(container).run({
 *   input: { billing_date: "2026-06-18" }
 * })
 * console.log(result.processed, "orders created")
 * ```
 */
export const triggerSubscriptionOrderWorkflow = createWorkflow(
  "trigger-subscription-order",
  (input: TriggerSubscriptionOrderInput) => {
    // Step 1: Find all due subscriptions (reuses output in step 2)
    const dueSubscriptions = fetchDueSubscriptionsStep({
      billing_date: input.billing_date ?? new Date().toISOString(),
    })

    // Step 2: Pass the due subscriptions directly — no re-query needed
    const output = generateSubscriptionOrdersStep({
      subscriptions: dueSubscriptions,
      dry_run: input.dry_run,
      billing_date: input.billing_date,
    })

    return new WorkflowResponse(output)
  }
)
