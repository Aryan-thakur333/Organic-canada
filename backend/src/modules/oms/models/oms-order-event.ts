import { model } from "@medusajs/framework/utils"

export const OmsOrderEvent = model.define("oms_order_event", {
  id: model.id().primaryKey(),
  oms_order_id: model.text(),
  vendor_order_id: model.text().nullable(),
  event_type: model.text(),
  previous_status: model.text().nullable(),
  new_status: model.text().nullable(),
  actor_type: model.text(),
  actor_id: model.text().nullable(),
  message: model.text(),
  metadata: model.json().nullable(),
})
