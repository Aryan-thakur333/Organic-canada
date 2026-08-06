import { model } from "@medusajs/framework/utils"

export const OmsReturnRequest = model.define("oms_return_request", {
  id: model.id().primaryKey(),
  oms_order_id: model.text(),
  vendor_order_id: model.text().nullable(),
  status: model.text().default("REQUESTED"),
  reason: model.text().nullable(),
  requested_by_type: model.text(),
  requested_by_id: model.text().nullable(),
  items: model.json().nullable(),
  metadata: model.json().nullable(),
})
