import { model } from "@medusajs/framework/utils"

export const CartItemPersonalization = model.define("cart_item_personalization", {
  id: model.id({ prefix: "cpi" }).primaryKey(),
  cart_id: model.text(),
  cart_item_id: model.text(),
  item_id: model.text().nullable(), // medusa core line item id on cart
  template_id: model.text(),
  product_id: model.text(),
  variant_id: model.text().nullable(),
  values: model.json().default({}),
  price_adjustment: model.number().default(0),
  template_snapshot: model.json().default({}),
  upload_references: model.json().nullable(),
  status: model.enum(["pending_review", "approved", "in_production", "completed", "rejected"]).default("pending_review"),
  metadata: model.json().nullable(),
})
