import { model } from "@medusajs/framework/utils"

export const Subscription = model.define("subscription", {
  id: model.id().primaryKey(),
  customer_id: model.text(),
  customer_email: model.text(),
  product_id: model.text().nullable(),
  product_title: model.text().nullable(),
  stripe_subscription_id: model.text().nullable(),
  stripe_customer_id: model.text().nullable(),
  stripe_payment_method_id: model.text().nullable(),
  plan: model.enum(["weekly", "monthly", "quarterly", "yearly"]).default("monthly"),
  status: model.enum(["active", "trialing", "past_due", "paused", "cancelled", "expired"]).default("active"),
  amount: model.number(),
  currency: model.text().default("usd"),
  next_billing_date: model.dateTime().nullable(),
  trial_end: model.dateTime().nullable(),
  last_billed_at: model.dateTime().nullable(),
  failed_payment_count: model.number().default(0),
  metadata: model.json().nullable(),
})
