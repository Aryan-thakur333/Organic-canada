import { model } from "@medusajs/framework/utils"
import { VendorOrder } from "./vendor-order"

export const VendorOrderActivity = model.define("vendor_order_activity", {
  id: model.id().primaryKey(),
  vendor_order: model.belongsTo(() => VendorOrder, {
    mappedBy: "activities"
  }),
  vendor_id: model.text(),
  type: model.enum([
    "order_received",
    "order_accepted",
    "order_rejected",
    "inventory_allocated",
    "processing_started",
    "order_prepared",
    "fulfillment_created",
    "shipment_created",
    "tracking_updated",
    "order_shipped",
    "order_delivered",
    "order_cancelled",
    "payment_authorized",
    "payment_captured",
    "payment_refunded",
    "note_added",
    // Retain legacy names for backward compatibility during runtime queries if they were already used
    "delivered",
    "admin_note",
    "customer_cancellation_requested"
  ]),
  title: model.text(),
  description: model.text().nullable(),
  actor_type: model.enum(["system", "vendor", "admin", "customer"]),
  actor_id: model.text().nullable(),
  metadata: model.json().nullable(),
})
