import { model } from "@medusajs/framework/utils"

export const SubscriptionProductConfiguration = model.define("subscription_product_configuration", {
  id: model.id({ prefix: "subcfg" }).primaryKey(),
  product_id_reference: model.text(),
  variant_id_reference: model.text().nullable(),
  enabled: model.boolean().default(false),
  allowed_intervals: model.json().nullable(),
  minimum_periods: model.number().default(1),
  maximum_periods: model.number().nullable(),
  discount_type: model.enum(["none", "percentage", "fixed"]).default("none"),
  discount_value: model.number().default(0),
  one_time_purchase_allowed: model.boolean().default(true),
  cancellation_policy: model.text().nullable(),
  pause_allowed: model.boolean().default(true),
  trial_period_days: model.number().default(0),
  metadata: model.json().nullable(),
})
