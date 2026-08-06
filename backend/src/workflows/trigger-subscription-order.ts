import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"

export type TriggerSubscriptionOrderInput = {
  billing_date?: string
  dry_run?: boolean
}

export type TriggerSubscriptionOrderOutput = {
  processed: number
  skipped: number
  errors: Array<{ subscription_id: string; error: string }>
  results: Array<Record<string, unknown>>
  charge_owner: "stripe_billing"
}

/**
 * Compatibility workflow retained for existing callers. Stripe Billing and
 * verified `invoice.paid` webhooks are the only permitted renewal trigger.
 * Calling this workflow can never create a charge or an order.
 */
export const rejectLocalRecurringOrderGenerationStep = createStep(
  "reject-local-recurring-order-generation",
  async (_input: TriggerSubscriptionOrderInput) => new StepResponse<TriggerSubscriptionOrderOutput>({
    processed: 0,
    skipped: 0,
    errors: [],
    results: [],
    charge_owner: "stripe_billing",
  })
)

export const triggerSubscriptionOrderWorkflow = createWorkflow(
  "trigger-subscription-order",
  (input: TriggerSubscriptionOrderInput) => new WorkflowResponse(
    rejectLocalRecurringOrderGenerationStep(input)
  )
)

