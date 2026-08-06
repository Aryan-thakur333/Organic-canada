export async function reconcileVendorDelivery({
  vendorOrder,
  nativeFulfillment,
  vendor,
  marketplaceService,
}: {
  vendorOrder: any
  nativeFulfillment: any
  vendor: { id: string }
  marketplaceService: any
}) {
  const isDelivered = !!nativeFulfillment?.delivered_at || nativeFulfillment?.status === "delivered" || nativeFulfillment?.status === "completed"

  if (!isDelivered) {
    return {
      delivered: false,
      vendorOrder,
    }
  }

  const deliveredAt = nativeFulfillment.delivered_at || vendorOrder.delivered_at || new Date().toISOString()

  const updatedVendorOrder = await marketplaceService.updateVendorOrders({
    id: vendorOrder.id,
    status: "delivered",
    fulfillment_status: "delivered",
    delivered_at: deliveredAt,
    metadata: {
      ...(vendorOrder.metadata || {}),
      native_fulfillment_id: nativeFulfillment.id,
    },
  })

  const existingActivities = await marketplaceService.listVendorOrderActivities({
    vendor_order_id: vendorOrder.id,
    type: "order_delivered",
  })

  if (!existingActivities || existingActivities.length === 0) {
    await marketplaceService.createVendorOrderActivities({
      vendor_order_id: vendorOrder.id,
      vendor_id: vendor.id,
      type: "order_delivered",
      title: "Order delivered",
      description: "The vendor shipment was delivered.",
      actor_type: "vendor",
      actor_id: vendor.id,
      metadata: {
        native_fulfillment_id: nativeFulfillment.id,
      },
    })
  }

  return {
    delivered: true,
    vendorOrder: updatedVendorOrder,
  }
}
