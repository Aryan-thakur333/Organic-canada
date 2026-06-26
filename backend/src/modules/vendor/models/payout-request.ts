import { model } from "@medusajs/framework/utils"

export const PayoutRequest = model.define("vendor_payout_request", {
  id: model.id().primaryKey(),
  vendor_id: model.text(),
  amount: model.number(),
  currency_code: model.text(),
  status: model.enum(["pending", "approved", "rejected", "paid"]).default("pending"),
  note: model.text().nullable(),
  external_reference: model.text().nullable(),
})
