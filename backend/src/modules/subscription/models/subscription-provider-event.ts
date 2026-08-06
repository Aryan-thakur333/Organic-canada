import { model } from "@medusajs/framework/utils"

export const SubscriptionProviderEvent = model.define("subscription_provider_event", {
  id: model.id({ prefix: "subevt" }).primaryKey(),
  provider: model.text(),
  provider_event_id: model.text(),
  event_type: model.text(),
  status: model.enum(["processing", "processed", "failed"]).default("processing"),
  error_code: model.text().nullable(),
  processed_at: model.dateTime().nullable(),
  metadata: model.json().nullable(),
})

