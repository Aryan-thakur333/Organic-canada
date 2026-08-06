/**
 * Canonical vendor order statuses and fulfillment statuses.
 * 
 * Every backend file MUST import from this source to ensure
 * consistency across DML model, migrations, state machine,
 * routes, repair scripts, and tests.
 */

export const VENDOR_ORDER_STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "processing",
  "prepared",
  "ready_to_ship",
  "shipped",
  "delivered",
  "cancelled",
] as const

export type VendorOrderStatus = (typeof VENDOR_ORDER_STATUSES)[number]

export const VENDOR_FULFILLMENT_STATUSES = [
  "not_fulfilled",
  "allocated",
  "preparing",
  "partially_fulfilled",
  "fulfilled",
  "shipped",
  "delivered",
  "cancelled",
] as const

export type VendorFulfillmentStatus = (typeof VENDOR_FULFILLMENT_STATUSES)[number]