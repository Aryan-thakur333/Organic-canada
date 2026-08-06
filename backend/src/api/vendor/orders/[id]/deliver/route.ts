import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MARKETPLACE_MODULE } from "../../../../../modules/marketplace"
import { validateVendorOrderTransition } from "../../../../../utils/marketplace/vendor-order-state"
import { recalculateParentOrderStatus } from "../../../../../utils/marketplace/recalculate-parent-order-status"
import { markOrderFulfillmentAsDeliveredWorkflow } from "@medusajs/core-flows"
import { resolveVendorFulfillment } from "../../../../../utils/marketplace/resolve-vendor-fulfillment"
import { reconcileVendorDelivery } from "../../../../../utils/marketplace/reconcile-vendor-delivery"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const vendor = (req as any).vendor
  if (!vendor?.id) {
    return res.status(401).json({ message: "Authentication required" })
  }

  const vendorOrderId = req.params.id
  const marketplaceService: any = req.scope.resolve(MARKETPLACE_MODULE)
  const container = req.scope

  console.log(`[VENDOR_DELIVER_START] vendor_order=${vendorOrderId} vendor=${vendor.id}`)

  try {
    console.log(`[VENDOR_DELIVER_VENDOR_RESOLVED] vendorId=${vendor.id}`)
    
    const vendorOrder = await marketplaceService.retrieveVendorOrder(vendorOrderId)
    console.log(`[VENDOR_DELIVER_ORDER_RESOLVED] vendorOrderId=${vendorOrder.id}`)
    
    if (vendorOrder.vendor_id !== vendor.id) {
      return res.status(403).json({ message: "Forbidden" })
    }

    if (vendorOrder.status === "delivered") {
      console.log(`[VENDOR_DELIVER_DONE] already delivered ${vendorOrderId}`)
      return res.json({ success: true, message: "Order is already delivered", order: vendorOrder })
    }

    validateVendorOrderTransition(vendorOrder.status, "delivered")

    console.log(`[VENDOR_DELIVER_NATIVE_BEFORE] resolving fulfillment for ${vendorOrderId}`)
    const resolved = await resolveVendorFulfillment(container, vendorOrderId)
    const nativeFulfillment = resolved.fulfillment
    const fulfillmentId = resolved.fulfillment_id || vendorOrder.metadata?.fulfillment_id

    console.log("[VENDOR_DELIVER_NATIVE_FULFILLMENT]", {
      vendorOrderId: vendorOrder.id,
      parentOrderId: vendorOrder.order_id,
      fulfillmentId: fulfillmentId,
      fulfillmentState: {
        shippedAt: nativeFulfillment?.shipped_at,
        deliveredAt: nativeFulfillment?.delivered_at,
        canceledAt: nativeFulfillment?.canceled_at,
      },
    })

    if (!fulfillmentId || !nativeFulfillment) {
      return res.status(409).json({ 
        code: "VENDOR_FULFILLMENT_MISSING",
        message: "A native fulfillment must exist before delivery." 
      })
    }

    if (!resolved.is_shipped && !nativeFulfillment.shipped_at) {
      return res.status(409).json({
        code: "VENDOR_SHIPMENT_REQUIRED",
        message: "The fulfillment must be shipped before it can be delivered."
      })
    }

    let currentFulfillment = nativeFulfillment
    const isAlreadyDelivered = !!nativeFulfillment.delivered_at || nativeFulfillment.status === "delivered" || nativeFulfillment.status === "completed"

    if (isAlreadyDelivered) {
      console.log(`[VENDOR_DELIVER_NATIVE_STATE_BEFORE] already delivered natively.`)
    } else {
      console.log(`[VENDOR_DELIVER_NATIVE_WORKFLOW_START] running markOrderFulfillmentAsDeliveredWorkflow for fulfillmentId=${fulfillmentId}`)
      
      // Execute native delivery workflow natively expecting camelCase keys
      await markOrderFulfillmentAsDeliveredWorkflow(container).run({
        input: {
          orderId: vendorOrder.order_id,
          fulfillmentId: fulfillmentId
        }
      })
      console.log(`[VENDOR_DELIVER_NATIVE_WORKFLOW_DONE] workflow completed without throwing.`)
      
      // Re-fetch to get updated state
      const refreshed = await resolveVendorFulfillment(container, vendorOrderId)
      currentFulfillment = refreshed.fulfillment
    }

    const { vendorOrder: updatedVendorOrder } = await reconcileVendorDelivery({
      vendorOrder,
      nativeFulfillment: currentFulfillment,
      vendor,
      marketplaceService
    })
    console.log(`[VENDOR_DELIVER_VENDOR_ORDER_UPDATED] reconciliation complete.`)

    await recalculateParentOrderStatus(container, vendorOrder.order_id)
    console.log(`[VENDOR_DELIVER_PARENT_RECALCULATED] done.`)

    // Release earnings (transition to available)
    try {
      const earning = await marketplaceService.listVendorEarnings({ vendor_order_id: vendorOrderId })
      if (earning && earning.length > 0 && earning[0].status === "locked") {
        await marketplaceService.updateVendorEarnings({
          id: earning[0].id,
          status: "available",
          available_at: new Date().toISOString()
        })
      }
    } catch (earningError) {
      console.error("[VendorOrderDeliver] Failed to update earnings state:", earningError)
    }

    const finalOrder = await marketplaceService.retrieveVendorOrder(vendorOrderId)
    console.log(`[VENDOR_DELIVER_DONE] success ${vendorOrderId}`)
    
    return res.json({ 
      success: true, 
      message: "Order delivered", 
      vendor_order: finalOrder,
      native_fulfillment: currentFulfillment
    })
  } catch (error: any) {
    console.error("[VENDOR_DELIVER_FAILED]", {
      name: error?.name,
      message: error?.message,
      type: error?.type,
      code: error?.code,
      stack: error?.stack,
      cause: error?.cause,
      responseData: error?.response?.data,
    })

    if (error.message?.includes("Invalid state transition")) {
      return res.status(409).json({ code: "VENDOR_DELIVERY_FAILED", message: error.message })
    }
    
    return res.status(error?.status || error?.statusCode || 400).json({ 
      code: "VENDOR_DELIVERY_FAILED", 
      message: "The shipment could not be marked as delivered." 
    })
  }
}
