import { model } from "@medusajs/framework/utils"
export const PricingImportPreview = model.define("pricingImportPreview", {
  id:model.id({prefix:"pip"}).primaryKey(), token:model.text().unique(), created_by:model.text().nullable(), file_name:model.text(), status:model.text(), total_rows:model.number().default(0), valid_rows:model.number().default(0), invalid_rows:model.number().default(0), stale_rows:model.number().default(0), duplicate_rows:model.number().default(0), payload:model.json(), expires_at:model.dateTime(),
})
