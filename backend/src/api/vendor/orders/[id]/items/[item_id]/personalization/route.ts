import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { PERSONALIZATION_MODULE } from "../../../../../../../modules/personalization"
import { MARKETPLACE_MODULE } from "../../../../../../../modules/marketplace"

type VendorOrderItemProjection = {
  order_item_id?: string | null
  line_item_id?: string | null
}

type VendorOrderProjection = {
  vendor_id: string
  items?: VendorOrderItemProjection[] | null
}

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const vendor = (req as any).vendor
  if (!vendor?.id) {
    return res.status(401).json({ message: "Authentication required" })
  }

  const { id: orderId, item_id: itemId } = req.params
  const { action, notes } = req.body as any

  const validActions = ["approve", "reject", "start_production", "mark_ready"]
  if (!validActions.includes(action)) {
    return res.status(400).json({ message: `Invalid action. Must be one of: ${validActions.join(", ")}` })
  }

  try {
    const marketplaceService: any = req.scope.resolve(MARKETPLACE_MODULE)
    const personalizationService: any = req.scope.resolve(PERSONALIZATION_MODULE)

    // 1. Verify vendor order and ownership of the item
    // Try resolving the vendorOrder ID first
    let resolvedVendorOrderId = orderId
    let vendorOrder: VendorOrderProjection | null = null
    try {
      vendorOrder = await marketplaceService.retrieveVendorOrder(resolvedVendorOrderId, {
        relations: ["items"]
      })
    } catch (e) {
      // ignore
    }

    if (!vendorOrder) {
      const query = req.scope.resolve("query")
      const { data: allOrders } = await query.graph({
        entity: "vendor_order",
        fields: ["id", "display_id", "order_id", "vendor_id", "status", "metadata"],
        filters: {}
      })

      const cleanId = orderId.replace(/^#/, "").trim().toLowerCase()
      const cands = allOrders.filter((o: any) => {
        if (o.id.toLowerCase() === cleanId) return true
        if (o.id.toLowerCase().endsWith(cleanId)) return true
        if (o.display_id != null && String(o.display_id).toLowerCase() === cleanId) return true
        if (o.metadata?.display_id != null && String(o.metadata.display_id).toLowerCase() === cleanId) return true
        if (o.metadata?.order_number != null && String(o.metadata.order_number).toLowerCase() === cleanId) return true
        return false
      })

      if (cands.length === 1) {
        resolvedVendorOrderId = cands[0].id
        vendorOrder = await marketplaceService.retrieveVendorOrder(resolvedVendorOrderId, {
          relations: ["items"]
        })
      }
    }

    if (!vendorOrder || vendorOrder.vendor_id !== vendor.id) {
      return res.status(403).json({ message: "Forbidden" })
    }

    const itemExists = vendorOrder.items?.some((i: any) => i.order_item_id === itemId || i.line_item_id === itemId)
    if (!itemExists) {
      return res.status(404).json({ message: "Order item not found" })
    }

    // 2. Find OrderItemPersonalization
    const personalizations = await personalizationService.listOrderItemPersonalizations({
      order_item_id: itemId
    })

    const op = personalizations?.[0]
    if (!op) {
      return res.status(404).json({ message: "Personalization snapshot not found for this item" })
    }

    const currentStatus = op.status || "pending_review"
    let nextStatus = currentStatus

    if (action === "approve") {
      nextStatus = "approved"
    } else if (action === "reject") {
      nextStatus = "rejected"
    } else if (action === "start_production") {
      if (currentStatus !== "approved") {
        return res.status(400).json({ message: "Cannot start production unless approved" })
      }
      nextStatus = "in_production"
    } else if (action === "mark_ready") {
      if (currentStatus !== "approved" && currentStatus !== "in_production") {
        return res.status(400).json({ message: "Cannot mark ready unless approved or in production" })
      }
      nextStatus = "completed"
    }

    const updatedMetadata = {
      ...(op.metadata || {}),
      production_status: nextStatus,
      vendor_notes: notes || op.metadata?.vendor_notes || null,
      updated_at: new Date().toISOString()
    }

    const updatedResult = await personalizationService.updateOrderItemPersonalizations({
      id: op.id,
      status: nextStatus,
      production_notes: notes || op.production_notes || null,
      metadata: updatedMetadata
    })
    const updated = Array.isArray(updatedResult) ? updatedResult[0] : updatedResult

    return res.status(200).json({ personalization: updated })
  } catch (error: any) {
    console.error("Personalization Action Error:", error)
    return res.status(500).json({ message: error.message || "Failed to update production status" })
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const vendor = (req as any).vendor
  if (!vendor?.id) {
    return res.status(401).json({ message: "Authentication required" })
  }

  const { id: orderId, item_id: itemId } = req.params

  try {
    const marketplaceService: any = req.scope.resolve(MARKETPLACE_MODULE)
    const personalizationService: any = req.scope.resolve(PERSONALIZATION_MODULE)

    // 1. Verify vendor order and ownership of the item
    // Try resolving display ID same as PUT
    let resolvedVendorOrderId = orderId
    let vendorOrder: VendorOrderProjection | null = null
    try {
      vendorOrder = await marketplaceService.retrieveVendorOrder(resolvedVendorOrderId, {
        relations: ["items"]
      })
    } catch (e) {
      // ignore
    }

    if (!vendorOrder) {
      const query = req.scope.resolve("query")
      const { data: allOrders } = await query.graph({
        entity: "vendor_order",
        fields: ["id", "display_id", "order_id", "vendor_id", "status", "metadata"],
        filters: {}
      })

      const cleanId = orderId.replace(/^#/, "").trim().toLowerCase()
      const cands = allOrders.filter((o: any) => {
        if (o.id.toLowerCase() === cleanId) return true
        if (o.id.toLowerCase().endsWith(cleanId)) return true
        if (o.display_id != null && String(o.display_id).toLowerCase() === cleanId) return true
        if (o.metadata?.display_id != null && String(o.metadata.display_id).toLowerCase() === cleanId) return true
        if (o.metadata?.order_number != null && String(o.metadata.order_number).toLowerCase() === cleanId) return true
        return false
      })

      if (cands.length === 1) {
        resolvedVendorOrderId = cands[0].id
        vendorOrder = await marketplaceService.retrieveVendorOrder(resolvedVendorOrderId, {
          relations: ["items"]
        })
      }
    }

    if (!vendorOrder || vendorOrder.vendor_id !== vendor.id) {
      return res.status(403).json({ message: "Forbidden" })
    }

    const itemExists = vendorOrder.items?.some((i: any) => i.order_item_id === itemId || i.line_item_id === itemId)
    if (!itemExists) {
      return res.status(404).json({ message: "Order item not found" })
    }

    // 2. Find OrderItemPersonalization
    const personalizations = await personalizationService.listOrderItemPersonalizations({
      order_item_id: itemId
    })

    const op = personalizations?.[0]
    if (!op) {
      return res.status(404).json({ message: "Personalization snapshot not found for this item" })
    }

    return res.status(200).json({ personalization: op })
  } catch (error: any) {
    console.error("Personalization Retrieve Error:", error)
    return res.status(500).json({ message: error.message || "Failed to retrieve production status" })
  }
}
