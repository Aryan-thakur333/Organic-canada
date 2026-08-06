import { MedusaContainer } from "@medusajs/framework"
import { MARKETPLACE_MODULE } from "../modules/marketplace/index.js"
import { resolveVendorFulfillment } from "../utils/marketplace/resolve-vendor-fulfillment.js"

export default async function repairVendorDeliveryState({
  container,
}: {
  container: MedusaContainer
}) {
  console.log("[VENDOR_DELIVERY_REPAIR_START] Starting delivery repair script...")

  const marketplaceService: any = container.resolve(MARKETPLACE_MODULE)

  // Find all orders that are either delivered or shipped
  const [vendorOrders] = await marketplaceService.listAndCountVendorOrders({
    status: ["delivered", "shipped"]
  }, { take: 1000 })

  console.log(`[VENDOR_DELIVERY_REPAIR_AUDIT] Found ${vendorOrders.length} potential orders to repair.`)

  for (const vendorOrder of vendorOrders) {
    const resolved = await resolveVendorFulfillment(container, vendorOrder.id)
    const nativeFulfillment = resolved.fulfillment

    if (!nativeFulfillment) continue

    const nativeIsDelivered = !!nativeFulfillment.delivered_at || nativeFulfillment.status === "delivered" || nativeFulfillment.status === "completed"
    
    // Check activities
    const existingActivities = await marketplaceService.listVendorOrderActivities({
      vendor_order_id: vendorOrder.id,
      type: "order_delivered",
    })

    if (nativeIsDelivered) {
      // Native is delivered. Make sure VendorOrder matches.
      if (vendorOrder.status !== "delivered") {
        await marketplaceService.updateVendorOrders({
          id: vendorOrder.id,
          status: "delivered",
          fulfillment_status: "delivered",
          delivered_at: nativeFulfillment.delivered_at || new Date().toISOString(),
          metadata: {
            ...(vendorOrder.metadata || {}),
            native_fulfillment_id: nativeFulfillment.id,
          },
        })
        console.log(`[VENDOR_DELIVERY_REPAIR_UPDATED] order ${vendorOrder.id} status aligned to delivered`)
      }

      if (!existingActivities || existingActivities.length === 0) {
        await marketplaceService.createVendorOrderActivities({
          vendor_order_id: vendorOrder.id,
          vendor_id: vendorOrder.vendor_id,
          type: "order_delivered",
          title: "Order delivered",
          description: "The vendor shipment was delivered.",
          actor_type: "system",
          actor_id: "system",
          metadata: {
            native_fulfillment_id: nativeFulfillment.id,
            repair: true
          },
        })
        console.log(`[VENDOR_DELIVERY_REPAIR_ACTIVITY_CREATED] order ${vendorOrder.id} activity created`)
      } else {
        console.log(`[VENDOR_DELIVERY_REPAIR_ACTIVITY_REUSED] order ${vendorOrder.id} already has activity`)
      }

    } else {
      // Native is NOT delivered.
      // If Custom VendorOrder is delivered or has an activity, it's premature.
      if (existingActivities && existingActivities.length > 0) {
        console.log(`[VENDOR_DELIVERY_REPAIR_PREMATURE_ACTIVITY_FOUND] order ${vendorOrder.id} - deleting premature activities`)
        for (const act of existingActivities) {
          await marketplaceService.deleteVendorOrderActivities(act.id)
        }
      }

      if (vendorOrder.status === "delivered" || vendorOrder.delivered_at) {
        console.log(`[VENDOR_DELIVERY_REPAIR_UPDATED] order ${vendorOrder.id} reverting premature delivery to shipped`)
        await marketplaceService.updateVendorOrders({
          id: vendorOrder.id,
          status: "shipped",
          fulfillment_status: "shipped",
          delivered_at: null
        })
      }
    }
  }

  console.log("[VENDOR_DELIVERY_REPAIR_DONE] Script execution complete.")
}
