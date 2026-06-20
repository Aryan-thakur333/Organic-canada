import { model } from "@medusajs/framework/utils"

export const DigitalAsset = model.define("digital_asset", {
  id: model.id({ prefix: "da" }).primaryKey(),
  product_id: model.text(),
  secure_s3_key: model.text(),
  file_name: model.text(),
  mime_type: model.text().default("application/octet-stream"),
  file_size: model.number().default(0),
  download_limit: model.number().default(0),
  download_count: model.number().default(0),
  is_active: model.boolean().default(true),
  metadata: model.json().nullable(),
})
