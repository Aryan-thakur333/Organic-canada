import { model } from "@medusajs/framework/utils"

export const SubscriptionPlan = model.define("subscription_plan", {
  id: model.id({ prefix: "subplan" }).primaryKey(),
  title: model.text(),
  description: model.text().nullable(),
  plan: model.enum(["weekly", "monthly", "quarterly", "yearly"]),
  amount: model.number(),
  currency: model.text().default("usd"),
  is_active: model.boolean().default(true),
  sort_order: model.number().default(0),
  metadata: model.json().nullable(),
})
