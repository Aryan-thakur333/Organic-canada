import { model } from "@medusajs/framework/utils"
import { VendorOrder } from "./vendor-order"

export const VendorOrderItem = model.define("vendor_order_item", {
  id: model.id().primaryKey(),
  vendor_order: model.belongsTo(() => VendorOrder, {
    mappedBy: "items"
  }),
  order_id: model.text(),
  order_item_id: model.text(),
  line_item_id: model.text(),
  product_id: model.text(),
  variant_id: model.text(),
  vendor_id: model.text(),
  title: model.text(),
  sku: model.text().nullable(),
  quantity: model.number(),
  unit_price: model.number(),
  subtotal: model.number(),
  commission_amount: model.number().default(0),
  vendor_net_amount: model.number().default(0),
  requires_shipping: model.boolean().default(true),
  inventory_item_id: model.text().nullable(),
  metadata: model.json().nullable(),
})
