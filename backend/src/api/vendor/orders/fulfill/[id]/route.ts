// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { asArray, getVendorProductIdSets } from "../../../_ownership"

async function verifyVendorOrderAccess(req: MedusaRequest, orderId: string) {
  const vendor = (req as any).vendor
  const query = req.scope.resolve("query")

  const { productIds, variantIds } = await getVendorProductIdSets(query, vendor.id)

  const { data: orders } = await query.graph({
    entity: "order",
    fields: ["id", "status", "fulfillment_status", "metadata", "items.id", "items.product_id", "items.variant_id"],
    filters: { id: orderId },
  })

  const order = orders?.[0]
  if (!order) return { accessible: false, reason: "Order not found" }

  const vendorItems = asArray(order.items).filter(
    (item: any) =>
      (item.variant_id && variantIds.has(item.variant_id)) ||
      (item.product_id && productIds.has(item.product_id))
  )

  if (!vendorItems.length) return { accessible: false, reason: "No vendor items in this order" }

  return { accessible: true, order, vendorItems }
}

/**
 * POST /vendor/orders/fulfill/:id/tracking
 * Add tracking information to a vendor's order items.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const { tracking_code, carrier, tracking_url } = req.body as any

  if (!tracking_code) {
    return res.status(400).json({ message: "tracking_code is required" })
  }

  try {
    const access = await verifyVendorOrderAccess(req, id)
    if (!access.accessible) {
      return res.status(404).json({ message: access.reason })
    }

    // Store tracking info in metadata on the order for vendor tracking
    const orderService: any = req.scope.resolve(Modules.ORDER)
    const existingOrder = access.order

    const vendorTracking = existingOrder.metadata?.vendor_tracking || {}
    vendorTracking[(req as any).vendor.id] = {
      tracking_code,
      tracking_number: tracking_code,
      carrier: carrier || "Other",
      tracking_url: tracking_url || "",
      updated_at: new Date().toISOString(),
    }

    await orderService.updateOrders({
      id,
      metadata: {
        ...(existingOrder.metadata || {}),
        vendor_tracking: vendorTracking,
      },
    })

    return res.json({
      message: "Tracking information added successfully",
      tracking: {
        tracking_code,
        tracking_number: tracking_code,
        carrier: carrier || "Other",
        tracking_url: tracking_url || "",
      },
    })
  } catch (error: any) {
    console.error("Vendor tracking add error:", error)
    return res.status(500).json({ message: error.message || "Failed to add tracking information" })
  }
}

/**
 * GET /vendor/orders/fulfill/:id
 * Get tracking info for a vendor's order shipment.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params

  try {
    const access = await verifyVendorOrderAccess(req, id)
    if (!access.accessible) {
      return res.status(404).json({ message: access.reason })
    }

    const vendorId = (req as any).vendor.id
    const tracking = access.order.metadata?.vendor_tracking?.[vendorId] || null

    return res.json({ tracking, fulfillment_status: access.order.fulfillment_status })
  } catch (error: any) {
    console.error("Vendor tracking get error:", error)
    return res.status(500).json({ message: error.message || "Failed to get tracking information" })
  }
}
