import { MARKETPLACE_MODULE } from "../../modules/marketplace/index"
import { resolveVendorFulfillment } from "./resolve-vendor-fulfillment"
import { recalculateParentOrderStatus } from "./recalculate-parent-order-status"

export async function syncVendorOrderFulfillmentState(container: any, vendorOrder: any) {
  const marketplaceService = container.resolve(MARKETPLACE_MODULE)
  
  // Resolve native fulfillment state
  const resolved = await resolveVendorFulfillment(container, vendorOrder.id)
  
  let updatedStatus = vendorOrder.status
  let updatedFulfillmentStatus = vendorOrder.fulfillment_status
  let metadataUpdate: any = {}
  
  if (resolved.is_fulfilled) {
    // 1. Native delivered -> delivered
    if (resolved.is_delivered) {
      updatedStatus = "delivered"
      updatedFulfillmentStatus = "delivered"
      if (!vendorOrder.delivered_at) {
        metadataUpdate.delivered_at = resolved.fulfillment.delivered_at || new Date().toISOString()
      }
    }
    // 2. Native shipped -> shipped
    else if (resolved.is_shipped) {
      updatedStatus = "shipped"
      updatedFulfillmentStatus = "shipped"
      if (!vendorOrder.shipped_at) {
        metadataUpdate.shipped_at = resolved.fulfillment.shipped_at || new Date().toISOString()
      }
      if (resolved.tracking) {
        metadataUpdate.tracking = resolved.tracking
        metadataUpdate.carrier = resolved.tracking.carrier
        metadataUpdate.service = resolved.tracking.service
        metadataUpdate.tracking_number = resolved.tracking.tracking_number
        metadataUpdate.tracking_url = resolved.tracking.tracking_url
      }
    }
    // 3. Native fulfillment exists -> ready_to_ship
    else {
      updatedStatus = "ready_to_ship"
      updatedFulfillmentStatus = "fulfilled"
    }

    // Always ensure fulfillment_id and native_fulfillment_id are stored in metadata
    if (
      vendorOrder.metadata?.fulfillment_id !== resolved.fulfillment_id ||
      vendorOrder.metadata?.native_fulfillment_id !== resolved.fulfillment_id
    ) {
      metadataUpdate.fulfillment_id = resolved.fulfillment_id
      metadataUpdate.native_fulfillment_id = resolved.fulfillment_id
    }
  }

  if (
    updatedStatus !== vendorOrder.status ||
    updatedFulfillmentStatus !== vendorOrder.fulfillment_status ||
    Object.keys(metadataUpdate).length > 0
  ) {
    const metadata = {
      ...(vendorOrder.metadata || {}),
      ...metadataUpdate
    }
    
    const updateData: any = {
      id: vendorOrder.id,
      status: updatedStatus,
      fulfillment_status: updatedFulfillmentStatus,
      metadata
    }

    if (updatedStatus === "delivered" && !vendorOrder.delivered_at) {
      updateData.delivered_at = metadataUpdate.delivered_at
    }
    if (updatedStatus === "shipped" && !vendorOrder.shipped_at) {
      updateData.shipped_at = metadataUpdate.shipped_at
    }

    await marketplaceService.updateVendorOrders(updateData)
    console.log(`[VENDOR_ORDERS_FULFILLMENT_SYNC] Synced vendor order ${vendorOrder.id} status to ${updatedStatus}`)
    
    // Create activity logs if state updated
    if (updatedStatus !== vendorOrder.status) {
      let type = "fulfillment_created"
      let title = "Fulfillment created"
      if (updatedStatus === "shipped") {
        type = "shipment_created"
        title = "Order shipped"
      } else if (updatedStatus === "delivered") {
        type = "order_delivered"
        title = "Order delivered"
      }

      await marketplaceService.createVendorOrderActivities({
        vendor_order_id: vendorOrder.id,
        vendor_id: vendorOrder.vendor_id,
        type,
        title,
        actor_type: "system",
        actor_id: "system"
      })
    }

    await recalculateParentOrderStatus(container, vendorOrder.order_id)
    
    return {
      ...vendorOrder,
      status: updatedStatus,
      vendor_fulfillment_status: updatedStatus,
      fulfillment_status: updatedFulfillmentStatus,
      metadata,
      delivered_at: updateData.delivered_at || vendorOrder.delivered_at,
      shipped_at: updateData.shipped_at || vendorOrder.shipped_at
    }
  }
  
  return {
    ...vendorOrder,
    status: updatedStatus,
    vendor_fulfillment_status: updatedStatus,
    fulfillment_status: updatedFulfillmentStatus
  }
}
