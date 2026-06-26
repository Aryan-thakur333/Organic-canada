// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../../../modules/vendor"

const asArray = (value: any) => {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

/**
 * GET /admin/vendor-products/:id/orders
 *
 * Returns all orders that contain products belonging to the specified vendor.
 * Each order includes only the vendor's line items, along with vendor-specific
 * tracking info, action state, and revenue share subtotal.
 *
 * Response:
 * {
 *   vendor: { id, name, email, status },
 *   orders: [{
 *     id, display_id, status, fulfillment_status, payment_status,
 *     created_at, currency_code, email,
 *     items: [{ id, product_id, variant_id, title, quantity, unit_price, thumbnail }],
 *     vendor_subtotal, tracking, vendor_action, items_count
 *   }]
 * }
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params

  try {
    const vendorService: any = req.scope.resolve(VENDOR_MODULE)
    const query: any = req.scope.resolve("query")

    // ── 1. Verify vendor exists ──────────────────────────────────────────
    let vendor
    try {
      vendor = await vendorService.retrieveVendor(id, {
        select: ["id", "name", "store_name", "email", "status"],
      })
    } catch {
      return res.status(404).json({ message: "Vendor not found" })
    }

    // ── 2. Get vendor products and variant IDs ───────────────────────────
    const { data: vendorData } = await query.graph({
      entity: "vendor",
      fields: [
        "product.id",
        "product.title",
        "product.variants.id",
      ],
      filters: { id },
    })

    const products = asArray(vendorData?.[0]?.product)
    const productIds = new Set(products.map((p: any) => p.id))
    const variantIds = new Set(
      products.flatMap((p: any) => asArray(p.variants).map((v: any) => v.id))
    )

    if (!productIds.size && !variantIds.size) {
      return res.json({
        vendor: { id: vendor.id, name: vendor.store_name || vendor.name },
        orders: [],
        total: 0,
      })
    }

    // ── 3. Fetch all orders ─────────────────────────────────────────────
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "email",
        "status",
        "fulfillment_status",
        "payment_status",
        "created_at",
        "currency_code",
        "metadata",
        "items.id",
        "items.product_id",
        "items.variant_id",
        "items.title",
        "items.quantity",
        "items.unit_price",
        "items.thumbnail",
      ],
      pagination: { take: 500 },
    })

    // ── 4. Filter to orders containing vendor's items ────────────────────
    const vendorOrders = asArray(orders)
      .map((order: any) => {
        const vendorItems = asArray(order.items).filter((item: any) =>
          (item.variant_id && variantIds.has(item.variant_id)) ||
          (item.product_id && productIds.has(item.product_id))
        )

        if (!vendorItems.length) return null

        const vendorSubtotal = vendorItems.reduce(
          (sum: number, item: any) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0),
          0
        )

        // Extract vendor-specific tracking and action state from metadata
        const vendorTracking = order.metadata?.vendor_tracking?.[id] || null
        const vendorAction = order.metadata?.vendor_actions?.[id] || null

        return {
          id: order.id,
          display_id: order.display_id,
          email: order.email,
          status: order.status,
          fulfillment_status: order.fulfillment_status || order.status,
          payment_status: order.payment_status,
          created_at: order.created_at,
          currency_code: order.currency_code,
          items: vendorItems.map((item: any) => ({
            id: item.id,
            product_id: item.product_id,
            variant_id: item.variant_id,
            title: item.title,
            quantity: item.quantity,
            unit_price: item.unit_price,
            thumbnail: item.thumbnail,
            line_total: (Number(item.unit_price || 0) * Number(item.quantity || 0)) / 100,
          })),
          vendor_subtotal: vendorSubtotal / 100,
          items_count: vendorItems.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0),
          tracking: vendorTracking,
          vendor_action: vendorAction,
          vendor_fulfillment_status: order.metadata?.vendor_fulfillment_status || "pending",
        }
      })
      .filter(Boolean)
      .sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )

    return res.json({
      vendor: {
        id: vendor.id,
        name: vendor.store_name || vendor.name,
        email: vendor.email,
        status: vendor.status,
      },
      orders: vendorOrders,
      total: vendorOrders.length,
    })
  } catch (error: any) {
    console.error("[Admin Vendor Orders] Error:", error)
    return res.status(500).json({
      message: error.message || "Failed to fetch vendor orders",
    })
  }
}
