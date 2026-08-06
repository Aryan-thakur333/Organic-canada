import { model } from "@medusajs/framework/utils"

const CommissionSetting = model.define("commission_setting", {
  id: model.id().primaryKey(),
  account_type: model.text().unique(),
  fee_type: model.text().default("percentage"),
  fee_value: model.number().default(10),
  is_active: model.boolean().default(true),
  metadata: model.json().nullable(),
})

export { CommissionSetting }
export default CommissionSetting
