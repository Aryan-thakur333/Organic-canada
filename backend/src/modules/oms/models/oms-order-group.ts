import { model } from "@medusajs/framework/utils"

export const OmsOrderGroup = model.define("oms_order_group", {
  id: model.id().primaryKey(),
  oms_order_id: model.text(),
  group_type: model.text(),
  reference: model.text(),
  metadata: model.json().nullable(),
})
