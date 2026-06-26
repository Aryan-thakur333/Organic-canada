import { model } from "@medusajs/framework/utils"

export const InventoryAudit = model.define("inventory_audit", {
  id: model.id().primaryKey(),
  vendor_id: model.text(),
  variant_id: model.text().nullable(),
  variant_title: model.text().nullable(),
  product_title: model.text().nullable(),
  sku: model.text().nullable(),
  inventory_item_id: model.text().nullable(),
  level_id: model.text(),
  previous_stocked_quantity: model.number().default(0),
  new_stocked_quantity: model.number().default(0),
  previous_reserved_quantity: model.number().default(0),
  new_reserved_quantity: model.number().default(0),
  change_type: model.enum([
    "restock",
    "adjustment",
    "manual_update",
    "order_fulfillment",
    "return",
    "admin_correction",
  ]).default("manual_update"),
  source: model.enum([
    "vendor_dashboard",
    "admin_dashboard",
    "system",
    "api",
  ]).default("vendor_dashboard"),
  actor_id: model.text().nullable(),
  actor_type: model.enum(["vendor", "admin", "system"]).default("vendor"),
  notes: model.text().nullable(),
})
