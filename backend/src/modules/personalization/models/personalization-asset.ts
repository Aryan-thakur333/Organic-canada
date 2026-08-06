import { model } from "@medusajs/framework/utils"
export const PersonalizationAsset = model.define("personalization_asset", {
  id: model.id({ prefix: "past" }).primaryKey(),
  template_id: model.text(),
  field_id: model.text().nullable(),
  owner_customer_id: model.text(),
  file_id: model.text(),
  type: model.enum(["image"]).default("image"),
  status: model.enum(["uploaded", "attached"]).default("uploaded"),
  url: model.text().nullable(),
  path: model.text().nullable(),
  size_bytes: model.number().nullable(),
  mime_type: model.text().nullable(),
  original_filename: model.text().nullable(),
  width: model.number().nullable(),
  height: model.number().nullable(),
  metadata: model.json().nullable(),
})
