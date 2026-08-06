import { model } from "@medusajs/framework/utils"

export const SubscriptionBillingOrder = model.define("subscription_billing_order", {
  id: model.id({ prefix: "subord" }).primaryKey(),
  subscription_id: model.text(),
  order_id_reference: model.text().nullable(),
  billing_period_key: model.text(),
  provider_payment_reference: model.text().nullable(),
  status: model.enum(["pending", "paid", "order_created", "failed"]).default("pending"),
  error_code: model.text().nullable(),
  metadata: model.json().nullable(),
})
