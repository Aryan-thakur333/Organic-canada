import { model } from "@medusajs/framework/utils"

export const BundleItem = model.define("bundle_item", {
  id: model.id({ prefix: "bndl" }).primaryKey(),
  parent_product_id: model.text(),
  child_product_id: model.text(),
  bundle_id: model.text().nullable(),
  variant_id: model.text().nullable(),
  quantity: model.number().default(1),
  sort_order: model.number().default(0),
  is_fulfillment_hidden: model.boolean().default(true),
  optional: model.boolean().default(false),
  metadata: model.json().nullable(),
})

// Unique constraint enforced at DB level:
// CREATE UNIQUE INDEX "idx_bundle_item_parent_child" ON "bundle_item" ("parent_product_id", "child_product_id");
