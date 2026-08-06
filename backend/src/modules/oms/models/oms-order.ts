import { model } from "@medusajs/framework/utils"

export const OmsOrder = model.define("oms_order", {
  id: model.id().primaryKey(),
  order_id: model.text(),
  display_id: model.number().nullable(),
  region_id: model.text().nullable(),
  currency_code: model.text().nullable(),
  customer_id: model.text().nullable(),
  sales_channel_id: model.text().nullable(),
  oms_status: model.text().default("PENDING"),
  payment_status: model.text().default("NOT_PAID"),
  fulfillment_status: model.text().default("NOT_FULFILLED"),
  total: model.number().default(0),
  metadata: model.json().nullable(),
})
