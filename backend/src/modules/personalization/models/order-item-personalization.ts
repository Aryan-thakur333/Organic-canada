import { model } from "@medusajs/framework/utils"

export const OrderItemPersonalization = model.define("order_item_personalization", {
  id: model.id({ prefix: "opi" }).primaryKey(),
  order_id: model.text(),
  order_item_id: model.text(),
  item_id: model.text().nullable(), // medusa core line item id on order
  template_id: model.text(),
  product_id: model.text(),
  variant_id: model.text().nullable(),
  values: model.json().default({}),
  price_adjustment: model.number().default(0),
  template_snapshot: model.json().default({}),
  upload_references: model.json().nullable(),
  status: model.enum(["pending_review", "approved", "in_production", "completed", "rejected"]).default("pending_review"),
  production_notes: model.text().nullable(),
  metadata: model.json().nullable(),
})
