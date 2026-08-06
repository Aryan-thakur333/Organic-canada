import { model } from "@medusajs/framework/utils"

export const SubscriptionItem = model.define("subscription_item", {
  id: model.id({ prefix: "subitem" }).primaryKey(),
  subscription_id: model.text(),
  variant_id_reference: model.text(),
  product_id_reference: model.text().nullable(),
  quantity: model.number(),
  unit_price_snapshot: model.number(),
  title_snapshot: model.text(),
  variant_title_snapshot: model.text().nullable(),
  metadata: model.json().nullable(),
})

