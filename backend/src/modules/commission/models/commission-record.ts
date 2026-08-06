import { model } from "@medusajs/framework/utils"

const CommissionRecord = model.define("commission_record", {
  id: model.id().primaryKey(),
  order_id: model.text().nullable(),
  customer_id: model.text().nullable(),
  vendor_id: model.text().nullable(),
  account_type: model.text(),
  base_amount: model.number().default(0),
  fee_type: model.text().default("percentage"),
  fee_value: model.number().default(0),
  commission_amount: model.number().default(0),
  vendor_payout: model.number().nullable(),
  currency_code: model.text().default("cad"),
  status: model.text().default("pending"),
  adjusted_commission_amount: model.number().nullable(),
  adjustment_reason: model.text().nullable(),
  adjusted_at: model.dateTime().nullable(),
  adjusted_by: model.text().nullable(),
  metadata: model.json().nullable(),
})

export { CommissionRecord }
export default CommissionRecord
