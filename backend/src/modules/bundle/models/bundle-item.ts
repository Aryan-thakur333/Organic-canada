import { model } from "@medusajs/framework/utils"

export const BundleItem = model.define("bundle_item", {
  id: model.id({ prefix: "bndl" }).primaryKey(),
  parent_product_id: model.text(),
  child_product_id: model.text(),
  quantity: model.number().default(1),
  sort_order: model.number().default(0),
  metadata: model.json().nullable(),
})

// Unique constraint enforced at DB level:
// CREATE UNIQUE INDEX "idx_bundle_item_parent_child" ON "bundle_item" ("parent_product_id", "child_product_id");
