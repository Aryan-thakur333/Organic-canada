// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

const ALLOWED_CARRIERS = new Set(["Canada Post", "UPS", "FedEx", "DHL", "Manual", "Organic Canada Delivery", "Shippo"])

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params
  const { tracking_number, tracking_code, carrier, tracking_url } = req.body as any
  const normalizedTrackingNumber = String(tracking_number || tracking_code || "").trim()
  const normalizedCarrier = String(carrier || "Manual").trim()
  const normalizedTrackingUrl = String(tracking_url || "").trim()

  if (!normalizedTrackingNumber) {
    return res.status(400).json({ message: "Tracking number is required" })
  }

  if (!ALLOWED_CARRIERS.has(normalizedCarrier)) {
    return res.status(400).json({ message: "Carrier must be Canada Post, UPS, FedEx, DHL, Shippo, Manual, or Organic Canada Delivery" })
  }

  try {
    const query = req.scope.resolve("query")
    const { data } = await query.graph({
      entity: "order",
      fields: ["id", "metadata"],
      filters: { id },
    })

    const order = data?.[0]
    if (!order) {
      return res.status(404).json({ message: "Order not found" })
    }

    const orderService: any = req.scope.resolve(Modules.ORDER)
    const tracking = {
      tracking_number: normalizedTrackingNumber,
      tracking_code: normalizedTrackingNumber,
      carrier: normalizedCarrier,
      tracking_url: normalizedTrackingUrl || null,
      updated_at: new Date().toISOString(),
    }

    const updated = await orderService.updateOrders({
      id,
      metadata: {
        ...(order.metadata || {}),
        tracking,
      },
    })

    return res.json({
      message: "Tracking information updated",
      order: updated,
      tracking,
    })
  } catch (error: any) {
    console.error("Admin tracking update error:", error)
    return res.status(500).json({ message: error.message || "Failed to update tracking information" })
  }
}

export const PATCH = POST
