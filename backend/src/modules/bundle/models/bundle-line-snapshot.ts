import { model } from "@medusajs/framework/utils"

export const BundleLineSnapshot = model.define("bundle_line_snapshot", {
  id: model.id({ prefix: "blsnap" }).primaryKey(),
  cart_id: model.text().nullable(),
  bundle_group_id: model.text().nullable(),
  status: model.enum(["pending", "active", "converted", "voided"]).default("pending"),
  cart_line_item_id: model.text().nullable(),
  order_id: model.text().nullable(),
  order_line_item_id: model.text().nullable(),
  bundle_id: model.text(),
  component_snapshot: model.json().default({}),
  bundle_price_snapshot: model.json().default({}),
  reservation_ids: model.json().nullable(),
  reservation_status: model.enum(["none", "reserved", "committed", "released", "restored"]).default("none"),
  metadata: model.json().nullable(),
})
