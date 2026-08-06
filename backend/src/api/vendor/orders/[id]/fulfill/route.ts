import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import { validateVendorOrderTransition } from "../../../../../utils/marketplace/vendor-order-state"
import { createVendorFulfillmentWorkflow } from "../../../../../workflows/create-vendor-fulfillment"
import { recalculateParentOrderStatus } from "../../../../../utils/marketplace/recalculate-parent-order-status"
import { resolveVendorFulfillment } from "../../../../../utils/marketplace/resolve-vendor-fulfillment"
import { resolveVendorStockLocation } from "../../../../../utils/marketplace/resolve-vendor-stock-location"
import { resolveVendorOrderItemInventory } from "../../../../../utils/marketplace/resolve-vendor-order-item-inventory"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { PERSONALIZATION_MODULE } from "../../../../../modules/personalization"

type VendorActor = { id: string }
type VendorOrderItem = {
  id: string
  line_item_id?: string | null
  order_item_id?: string | null
  variant_id?: string | null
  sku?: string | null
  title?: string | null
  quantity: number
}
type VendorOrder = {
  id: string
  vendor_id: string
  order_id: string
  status: string
  metadata?: Record<string, unknown> | null
  items: VendorOrderItem[]
}
type FulfillmentBody = { location_id?: string }

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const vendor = (req as unknown as { vendor?: VendorActor }).vendor
  if (!vendor?.id) {
    return res.status(401).json({ message: "Authentication required" })
  }

  let vendorOrderId = req.params.id
  const marketplaceService: any = req.scope.resolve(MARKETPLACE_MODULE)
  const container = req.scope

  try {
    console.log("[VENDOR_FULFILL_START]", vendorOrderId, "vendor:", vendor.id)

    let resolvedVendorOrderId = vendorOrderId
    let resolutionMethod = "exact_match"

    // 1. Try retrieve by exact VendorOrder ID
    let vendorOrder: VendorOrder | null = null
    try {
      vendorOrder = await marketplaceService.retrieveVendorOrder(resolvedVendorOrderId, {
        relations: ["items"]
      })
    } catch (e) {
      // Ignore to try resolving
    }

    // 2. If not found, resolve display/reference identifiers
    if (!vendorOrder) {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY || "query")
      const { data: allOrders } = await query.graph({
        entity: "vendor_order",
        fields: ["id", "display_id", "order_id", "vendor_id", "status", "metadata"],
        filters: {}
      })

      const cleanId = vendorOrderId.replace(/^#/, "").trim().toLowerCase()
      const cands = allOrders.filter((o: any) => {
        if (o.id.toLowerCase() === cleanId) return true
        if (o.id.toLowerCase().endsWith(cleanId)) return true
        if (o.display_id != null && String(o.display_id).toLowerCase() === cleanId) return true
        if (o.metadata?.display_id != null && String(o.metadata.display_id).toLowerCase() === cleanId) return true
        if (o.metadata?.order_number != null && String(o.metadata.order_number).toLowerCase() === cleanId) return true
        if (o.order_id && o.order_id.toLowerCase() === cleanId) return true
        return false
      })

      if (cands.length === 1) {
        resolvedVendorOrderId = cands[0].id
        resolutionMethod = "display_reference_match"
        vendorOrder = await marketplaceService.retrieveVendorOrder(resolvedVendorOrderId, {
          relations: ["items"]
        })
      } else if (cands.length > 1) {
        const vendorCands = cands.filter((o: any) => o.vendor_id === vendor.id)
        if (vendorCands.length === 1) {
          resolvedVendorOrderId = vendorCands[0].id
          resolutionMethod = "display_reference_vendor_match"
          vendorOrder = await marketplaceService.retrieveVendorOrder(resolvedVendorOrderId, {
            relations: ["items"]
          })
        }
      }
    }

    console.log("[VENDOR_FULFILL_ROUTE_IDENTIFIER]", {
      routeParamId: vendorOrderId,
      resolvedVendorOrderId,
      resolutionMethod
    })

    if (!vendorOrder) {
      return res.status(404).json({
        code: "VENDOR_ORDER_NOT_FOUND",
        message: `VendorOrder with id or reference: ${vendorOrderId} was not found`
      })
    }

    // Reassign variable so downstream code uses the correct resolved ID
    vendorOrderId = resolvedVendorOrderId

    if (vendorOrder.vendor_id !== vendor.id) {
      return res.status(403).json({ message: "Forbidden" })
    }

    // Block fulfillment for incomplete personalized products
    try {
      const personalizationService: any = req.scope.resolve(PERSONALIZATION_MODULE)
      const itemIds = vendorOrder.items.map((i: any) => i.line_item_id || i.order_item_id).filter(Boolean)
      if (itemIds.length > 0) {
        const orderPersonalizations = await personalizationService.listOrderItemPersonalizations({
          order_item_id: { $in: itemIds }
        })
        for (const op of orderPersonalizations) {
          const template = await personalizationService.retrievePersonalizationTemplate(op.template_id)
          if (template) {
            const requiresApproval = template.requires_vendor_approval
            const requiresProduction = template.requires_production
            const prodStatus = op.metadata?.production_status || "pending_review"

            if (requiresApproval && prodStatus === "pending_review") {
              return res.status(409).json({
                code: "PERSONALIZATION_NOT_READY",
                message: "The personalized item must be completed before fulfillment."
              })
            }
            if (requiresProduction && prodStatus !== "ready") {
              return res.status(409).json({
                code: "PERSONALIZATION_NOT_READY",
                message: "The personalized item must be completed before fulfillment."
              })
            }
          }
        }
      }
    } catch (e: any) {
      console.error("Personalization check error during fulfillment:", e)
    }

    if (vendorOrder.status === "ready_to_ship") {
      return res.json({ success: true, message: "Fulfillment already created", order: vendorOrder })
    }

    validateVendorOrderTransition(vendorOrder.status, "ready_to_ship")

    // Check for existing matching native fulfillment
    const resolved = await resolveVendorFulfillment(container, vendorOrderId)
    if (resolved.is_fulfilled) {
      console.log("[VENDOR_FULFILL_EXISTING_CHECK] Found existing fulfillment:", resolved.fulfillment_id)
      await marketplaceService.updateVendorOrders({
        id: vendorOrderId,
        status: "ready_to_ship",
        fulfillment_status: "fulfilled",
        metadata: {
          ...(vendorOrder.metadata || {}),
          native_fulfillment_id: resolved.fulfillment_id,
        }
      })

      await marketplaceService.createVendorOrderActivities({
        vendor_order_id: vendorOrderId,
        vendor_id: vendor.id,
        type: "fulfillment_created",
        title: "Fulfillment reused (existing matched)",
        actor_type: "vendor",
        actor_id: vendor.id
      })

      await recalculateParentOrderStatus(container, vendorOrder.order_id)
      const updated = await marketplaceService.retrieveVendorOrder(vendorOrderId)

      return res.json({ success: true, message: "Fulfillment created (reused existing)", fulfillment: resolved.fulfillment, order: updated })
    }

    // ── Resolve stock location ─────────────────────────────────────────────
    const requestedLocationId = (req.body as FulfillmentBody | undefined)?.location_id || null
    console.log("[VENDOR_FULFILL_LOCATION_INPUT]", requestedLocationId)

    let resolvedLocation
    try {
      resolvedLocation = await resolveVendorStockLocation({
        container,
        vendorId: vendor.id,
        vendorOrder,
        requestedLocationId,
      })
    } catch (locErr: any) {
      const code = locErr.code || ""
      if (code === "VENDOR_STOCK_LOCATION_REQUIRED") {
        return res.status(422).json({
          code: "VENDOR_STOCK_LOCATION_REQUIRED",
          message: "No stock location is assigned to this vendor.",
        })
      }
      if (code === "VENDOR_STOCK_LOCATION_INVALID") {
        return res.status(422).json({
          code: "VENDOR_STOCK_LOCATION_INVALID",
          message: "The selected stock location does not exist.",
        })
      }
      if (code === "VENDOR_STOCK_LOCATION_FORBIDDEN") {
        return res.status(403).json({
          code: "VENDOR_STOCK_LOCATION_FORBIDDEN",
          message: "You cannot use this stock location.",
        })
      }
      throw locErr
    }

    console.log("[VENDOR_FULFILL_LOCATION_RESOLVED]", resolvedLocation.id, resolvedLocation.name)

    // ── Resolve items ──────────────────────────────────────────────────────
    const items = vendorOrder.items.map((i: any) => ({
      id: i.line_item_id || i.order_item_id,
      quantity: i.quantity,
    }))

    // Validate items have native IDs
    const missingItemIds = items.filter((i: any) => !i.id)
    if (missingItemIds.length > 0) {
      return res.status(422).json({
        code: "VENDOR_ORDER_ITEMS_MISSING_NATIVE_IDS",
        message: "Some vendor order items are missing native order item IDs.",
      })
    }

    console.log("[VENDOR_FULFILL_ITEMS_RESOLVED]", JSON.stringify(items))

    // ── Validate Inventory Levels ──────────────────────────────────────────
    const inventoryService: any = container.resolve(Modules.INVENTORY)
    
    for (const item of vendorOrder.items) {
      const resolved = await resolveVendorOrderItemInventory({
        container,
        vendorOrderItem: item,
        parentOrderId: vendorOrder.order_id
      })

      // Backfill variant_id and other details if variant_id was empty
      if (!item.variant_id) {
        await marketplaceService.updateVendorOrderItems({
          id: item.id,
          variant_id: resolved.variantId,
          product_id: resolved.productId,
          sku: item.sku || resolved.sku || "",
          title: item.title || resolved.title || ""
        })

        console.log("[VENDOR_FULFILL_ITEM_BACKFILLED]", {
          vendorOrderItemId: item.id,
          variantId: resolved.variantId,
          productId: resolved.productId
        })
      }

      if (!resolved.manageInventory) {
        continue
      }

      for (const link of resolved.inventoryItems) {
        const requiredQuantity = link.requiredQuantity
        const requestedQuantity = link.requiredInventoryQuantity
        
        console.log("[VENDOR_FULFILL_RUNTIME_TARGET]", {
          vendorOrderId: vendorOrder.id,
          parentOrderId: vendorOrder.order_id,
          vendorId: vendor.id,
          parentLineItemId: item.line_item_id || item.order_item_id,
          variantId: resolved.variantId,
          inventoryItemId: link.inventoryItemId,
          stockLocationId: resolvedLocation.id,
          orderedQuantity: item.quantity,
          requiredQuantity: requestedQuantity,
        })

        const levels = await inventoryService.listInventoryLevels({
          inventory_item_id: link.inventoryItemId,
          location_id: resolvedLocation.id,
        })
        let level = levels[0]

        if (!level) {
          return res.status(422).json({
            code: "VENDOR_INVENTORY_LEVEL_MISSING",
            message: `Inventory is not configured for ${item.title || resolved.title || "product"} at ${resolvedLocation.name || "your vendor warehouse"}.`,
            details: [
              {
                vendor_order_id: vendorOrder.id,
                vendor_order_item_id: item.id,
                parent_line_item_id: item.line_item_id || item.order_item_id,
                variant_id: resolved.variantId,
                inventory_item_id: link.inventoryItemId,
                stock_location_id: resolvedLocation.id,
                requested_quantity: requestedQuantity
              }
            ]
          })
        }

        const available = level.stocked_quantity - level.reserved_quantity
        if (available < requestedQuantity) {
          return res.status(422).json({
            code: "VENDOR_INSUFFICIENT_INVENTORY",
            message: "There is not enough inventory at your vendor warehouse.",
            details: [
              {
                requested_quantity: requestedQuantity,
                available_quantity: available
              }
            ]
          })
        }
      }
    }

    // ── Execute native fulfillment workflow ─────────────────────────────────
    console.log("[VENDOR_FULFILL_NATIVE_START]")
    const { result } = await createVendorFulfillmentWorkflow(container).run({
      input: {
        vendor_order_id: vendorOrderId,
        vendor_id: vendor.id,
        order_id: vendorOrder.order_id,
        location_id: resolvedLocation.id,
        items,
      },
    })
    console.log("[VENDOR_FULFILL_NATIVE_DONE]", result?.id)

    // ── Update VendorOrder metadata with native fulfillment info ────────────
    await marketplaceService.updateVendorOrders({
      id: vendorOrderId,
      metadata: {
        ...(vendorOrder.metadata || {}),
        native_fulfillment_id: result?.id,
        stock_location_id: resolvedLocation.id,
        fulfillment_provider_id: "manual_manual",
      },
    })

    console.log("[VENDOR_FULFILL_VENDOR_ORDER_UPDATED]")

    // ── Create activity ────────────────────────────────────────────────────
    const existingActivities = await marketplaceService.listVendorOrderActivities({
      vendor_order_id: vendorOrderId,
      type: "fulfillment_created",
    })

    if (!existingActivities || existingActivities.length === 0) {
      await marketplaceService.createVendorOrderActivities({
        vendor_order_id: vendorOrderId,
        vendor_id: vendor.id,
        type: "fulfillment_created",
        title: "Fulfillment created",
        description: `Fulfillment created at ${resolvedLocation.name}`,
        actor_type: "vendor",
        actor_id: vendor.id,
      })
    }

    await recalculateParentOrderStatus(container, vendorOrder.order_id)

    const updated = await marketplaceService.retrieveVendorOrder(vendorOrderId)

    console.log("[VENDOR_FULFILL_DONE] status:", updated.status, "fulfillment:", updated.fulfillment_status)

    return res.json({
      success: true,
      message: "Fulfillment created",
      vendor_order: {
        id: updated.id,
        status: updated.status,
        fulfillment_status: updated.fulfillment_status,
        metadata: updated.metadata,
      },
      native_fulfillment: {
        id: result?.id,
        location_id: resolvedLocation.id,
        status: "not_shipped",
      },
    })
  } catch (error: any) {
    console.log("[VENDOR_FULFILL_FAILED]", error.message)
    if (error.message?.includes("Invalid state transition")) {
      return res.status(409).json({ message: error.message })
    }
    // Safe error — do not leak internal details
    return res.status(400).json({ message: error.message || "Fulfillment failed" })
  }
}
