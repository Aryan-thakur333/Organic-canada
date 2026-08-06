import { model } from "@medusajs/framework/utils"
export const PricingApplyBatch = model.define("pricingApplyBatch", {
  id:model.id({prefix:"pab"}).primaryKey(), status:model.text(), created_by:model.text().nullable(), approved_rows:model.number().default(0), planned_write_count:model.number().default(0), successful_write_count:model.number().default(0), failed_write_count:model.number().default(0), backup_path:model.text().nullable(), report_path:model.text().nullable(), completed_at:model.dateTime().nullable(),
})
