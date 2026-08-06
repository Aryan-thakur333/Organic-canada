import { model } from "@medusajs/framework/utils"

export const BundleDefinition = model.define("bundle_definition", {
  id: model.id({ prefix: "bundle" }).primaryKey(),
  title: model.text(),
  handle: model.text(),
  status: model.enum(["draft", "active", "archived"]).default("draft"),
  bundle_type: model.enum(["fixed_bundle"]).default("fixed_bundle"),
  pricing_strategy: model.enum(["fixed_price"]).default("fixed_price"),
  inventory_strategy: model.enum(["components"]).default("components"),
  product_id: model.text(),
  variant_id: model.text(),
  sales_channel_ids: model.json().nullable(),
  metadata: model.json().nullable(),
})
