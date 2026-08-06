import { model } from "@medusajs/framework/utils"

export const QuoteMessage = model.define("b2bQuoteMessage", {
  id: model.id({ prefix: "b2bqm" }).primaryKey(),
  quote_id: model.text(),
  sender_type: model.enum(["customer", "admin", "system"]),
  sender_id: model.text().nullable(),
  message: model.text(),
  is_system_message: model.boolean().default(false),
  read_at: model.dateTime().nullable(),
  metadata: model.json().nullable(),
})
