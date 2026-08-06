import { model } from "@medusajs/framework/utils"

export const OmsFulfillmentAssignment = model.define("oms_fulfillment_assignment", {
  id: model.id().primaryKey(),
  oms_order_id: model.text(),
  vendor_order_id: model.text(),
  stock_location_id: model.text(),
  status: model.text().default("ASSIGNED"),
  region_id: model.text().nullable(),
  sales_channel_id: model.text().nullable(),
  reservation_ids: model.json().nullable(),
  metadata: model.json().nullable(),
})
