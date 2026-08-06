import { model } from "@medusajs/framework/utils"

export const PRODUCT_TYPE_ENUM = ["standard", "digital", "subscription", "personalized", "bundle"] as const
export type ProductType = (typeof PRODUCT_TYPE_ENUM)[number]

export const PersonalizationTemplate = model.define("personalization_template", {
  id: model.id({ prefix: "ptmpl" }).primaryKey(),
  product_id: model.text(),
  variant_id: model.text().nullable(),
  vendor_id: model.text().nullable(),
  title: model.text(),
  description: model.text().nullable(),
  status: model.enum(["draft", "active", "archived"]).default("draft"),
  is_active: model.boolean().default(false),
  requires_vendor_approval: model.boolean().default(false),
  requires_production: model.boolean().default(false),
  version: model.number().default(1),
  version_lineage_id: model.text().nullable(),
  schema_hash: model.text().nullable(),
  published_at: model.dateTime().nullable(),
  metadata: model.json().nullable(),
})
