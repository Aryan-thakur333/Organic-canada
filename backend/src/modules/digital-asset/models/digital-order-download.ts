import { model } from "@medusajs/framework/utils"

export const DigitalOrderDownload = model.define("digital_order_download", {
  id: model.id({ prefix: "dld" }).primaryKey(),
  order_id: model.text(),
  line_item_id: model.text().nullable(),
  product_id: model.text(),
  customer_id: model.text(),
  digital_asset_id: model.text(),
  license_key: model.text().nullable(),
  remaining_downloads: model.number().default(0),
  download_count: model.number().default(0),
  expires_at: model.dateTime().nullable(),
  last_downloaded_at: model.dateTime().nullable(),
  is_active: model.boolean().default(true),
  metadata: model.json().nullable(),
})
