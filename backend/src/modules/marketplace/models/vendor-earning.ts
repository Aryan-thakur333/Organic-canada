import { model } from "@medusajs/framework/utils"
import { VendorOrder } from "./vendor-order"

export const VendorEarning = model.define("vendor_earning", {
  id: model.id().primaryKey(),
  vendor_order: model.belongsTo(() => VendorOrder, {
    mappedBy: "earning"
  }),
  vendor_id: model.text(),
  order_id: model.text(),
  gross_amount: model.number(),
  commission_amount: model.number(),
  net_amount: model.number(),
  status: model.enum(["pending", "locked", "available", "paid", "reversed"]).default("pending"),
  available_at: model.dateTime().nullable(),
  paid_at: model.dateTime().nullable(),
  payout_reference: model.text().nullable(),
  metadata: model.json().nullable(),
})
