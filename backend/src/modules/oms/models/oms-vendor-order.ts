import { model } from "@medusajs/framework/utils"

export const OmsVendorOrder = model.define("oms_vendor_order", {
  id: model.id().primaryKey(),
  oms_order_id: model.text(),
  order_id: model.text(),
  vendor_id: model.text(),
  vendor_order_reference: model.text(),
  status: model.text().default("PENDING"),
  fulfillment_status: model.text().default("NOT_FULFILLED"),
  item_total: model.number().default(0),
  currency_code: model.text(),
  assigned_location_id: model.text().nullable(),
  metadata: model.json().nullable(),
})
