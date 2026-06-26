import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { SUBSCRIPTION_MODULE } from "../modules/subscription"

const PLANS = [
  { id: "subplan_weekly", title: "Weekly Plan", plan: "weekly", amount: 1999, interval: "week", period: 1, display: "Weekly", sort_order: 1, description: "Fresh organic essentials delivered every week." },
  { id: "subplan_monthly", title: "Monthly Plan", plan: "monthly", amount: 6999, interval: "month", period: 1, display: "Monthly", sort_order: 2, description: "A curated organic delivery every month." },
  { id: "subplan_yearly", title: "Yearly Plan", plan: "yearly", amount: 69900, interval: "year", period: 1, display: "1 Year", sort_order: 3, description: "One year of recurring organic deliveries and member benefits." },
  { id: "subplan_two_year", title: "Two Year Plan", plan: "yearly", amount: 129900, interval: "year", period: 2, display: "2 Years", sort_order: 4, description: "Two years of organic deliveries at the best long-term value." },
]

export default async function seedSubscriptionPlans({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const service: any = container.resolve(SUBSCRIPTION_MODULE)
  const existing = await service.listSubscriptionPlans({}, { withDeleted: false })
  const byId = new Map(existing.map((plan: any) => [plan.id, plan]))
  const canonicalIds = new Set(PLANS.map((plan) => plan.id))

  for (const legacyPlan of existing.filter((plan: any) => !canonicalIds.has(plan.id) && plan.is_active)) {
    await service.updateSubscriptionPlans({ id: legacyPlan.id, is_active: false })
    logger.info(`[subscription-plans] deactivated legacy plan ${legacyPlan.title} (${legacyPlan.id})`)
  }

  for (const definition of PLANS) {
    const data = {
      id: definition.id,
      title: definition.title,
      description: definition.description,
      plan: definition.plan,
      amount: definition.amount,
      currency: "cad",
      is_active: true,
      sort_order: definition.sort_order,
      metadata: {
        interval: definition.interval,
        period: definition.period,
        display: definition.display,
        fast_delivery: true,
      },
    }
    if (byId.has(definition.id)) await service.updateSubscriptionPlans(data)
    else await service.createSubscriptionPlans(data)
    logger.info(`[subscription-plans] upserted ${definition.title} (${definition.id})`)
  }
}
