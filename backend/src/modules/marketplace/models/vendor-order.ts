import { model } from "@medusajs/framework/utils"
import { VendorOrderItem } from "./vendor-order-item"
import { VendorOrderActivity } from "./vendor-order-activity"
import { VendorEarning } from "./vendor-earning"
import {
  VENDOR_ORDER_STATUSES,
  VENDOR_FULFILLMENT_STATUSES,
} from "../constants/vendor-order-status"

export const VendorOrder = model.define("vendor_order", {
  id: model.id().primaryKey(),
  vendor_id: model.text(),
  order_id: model.text(),
  display_id: model.number().nullable(),
  items: model.hasMany(() => VendorOrderItem, {
    mappedBy: "vendor_order"
  }),
  activities: model.hasMany(() => VendorOrderActivity, {
    mappedBy: "vendor_order"
  }),
  earning: model.hasOne(() => VendorEarning, {
    mappedBy: "vendor_order"
  }),
  status: model.enum([...VENDOR_ORDER_STATUSES]).default("pending"),
  payment_status: model.enum([
    "awaiting_payment",
    "captured",
    "refunded",
    "partially_refunded"
  ]).default("awaiting_payment"),
  fulfillment_status: model.enum([...VENDOR_FULFILLMENT_STATUSES]).default("not_fulfilled"),
  currency_code: model.text(),
  item_subtotal: model.number().default(0),
  shipping_total: model.number().default(0),
  tax_total: model.number().default(0),
  discount_total: model.number().default(0),
  commission_total: model.number().default(0),
  vendor_net_total: model.number().default(0),
  accepted_at: model.dateTime().nullable(),
  rejected_at: model.dateTime().nullable(),
  rejection_reason: model.text().nullable(),
  prepared_at: model.dateTime().nullable(),
  processing_at: model.dateTime().nullable(),
  shipped_at: model.dateTime().nullable(),
  delivered_at: model.dateTime().nullable(),
  cancelled_at: model.dateTime().nullable(),
  metadata: model.json().nullable(),
})
