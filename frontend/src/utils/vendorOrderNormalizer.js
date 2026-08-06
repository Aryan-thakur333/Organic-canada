/**
 * Normalize a vendor order response to ensure all arrays and numbers
 * have safe defaults, preventing reduce/map/filter crashes.
 */
export function normalizeVendorOrder(order) {
  const normalized = order && typeof order === "object" ? order : {}

  return {
    ...normalized,

    items: Array.isArray(normalized.items)
      ? normalized.items
      : Array.isArray(normalized.vendor_order_items)
        ? normalized.vendor_order_items
        : [],

    activities: Array.isArray(normalized.activities)
      ? normalized.activities
      : [],

    fulfillments: Array.isArray(normalized.fulfillments)
      ? normalized.fulfillments
      : [],

    tracking_links: Array.isArray(normalized.tracking_links)
      ? normalized.tracking_links
      : [],

    gross_amount: Number(
      normalized.gross_amount ??
      normalized.item_subtotal ??
      normalized.subtotal ??
      0
    ),

    commission_total: Number(
      normalized.commission_total ??
      normalized.commission_amount ??
      0
    ),

    vendor_net_total: Number(
      normalized.vendor_net_total ??
      normalized.vendor_net_amount ??
      0
    ),
  }
}

export function safeArray(value) {
  return Array.isArray(value) ? value : []
}

export function safeNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}