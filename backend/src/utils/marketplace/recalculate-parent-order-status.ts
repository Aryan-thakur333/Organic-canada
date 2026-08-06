import { MARKETPLACE_MODULE } from "../../modules/marketplace/index"
import { Modules } from "@medusajs/framework/utils"

export async function recalculateParentOrderStatus(container: any, orderId: string) {
  const marketplaceService: any = container.resolve(MARKETPLACE_MODULE)
  const orderService: any = container.resolve(Modules.ORDER)

  // 1. Fetch all VendorOrders for this order
  const vendorOrders = await marketplaceService.listVendorOrders({
    order_id: orderId
  })

  if (!vendorOrders || vendorOrders.length === 0) return

  let anyPending = false
  let anyProcessing = false
  let someShipped = false
  let allShipped = true
  let someDelivered = false
  let allDelivered = true

  const vendorOrderStatuses: Record<string, string> = {}

  for (const vo of vendorOrders) {
    vendorOrderStatuses[vo.vendor_id] = vo.status

    if (vo.status === "pending") {
      anyPending = true
    }
    if (["accepted", "processing", "prepared", "ready_to_ship"].includes(vo.status)) {
      anyProcessing = true
    }
    if (vo.status === "shipped") {
      someShipped = true
    }
    if (vo.status !== "shipped" && vo.status !== "delivered" && vo.status !== "cancelled") {
      allShipped = false
    }
    if (vo.status === "delivered") {
      someDelivered = true
    }
    if (vo.status !== "delivered" && vo.status !== "cancelled") {
      allDelivered = false
    }
  }

  let parentStatus = "pending"

  if (allDelivered && vendorOrders.some(v => v.status === "delivered")) {
    parentStatus = "delivered"
  } else if (someDelivered) {
    parentStatus = "partially_delivered"
  } else if (allShipped && vendorOrders.some(v => v.status === "shipped")) {
    parentStatus = "shipped"
  } else if (someShipped) {
    parentStatus = "partially_shipped"
  } else if (anyProcessing) {
    parentStatus = "processing"
  } else if (anyPending) {
    parentStatus = "pending"
  }

  // 3. Update Order metadata
  const order = await orderService.retrieveOrder(orderId)
  
  await orderService.updateOrders({
    id: orderId,
    metadata: {
      ...(order.metadata || {}),
      marketplace_status: parentStatus,
      vendor_order_statuses: {
        ...(typeof order.metadata?.vendor_order_statuses === "object" ? order.metadata.vendor_order_statuses : {}),
        ...vendorOrderStatuses
      },
      marketplace_updated_at: new Date().toISOString()
    }
  })

  return parentStatus
}
