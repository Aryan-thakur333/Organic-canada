/**
 * Repair Vendor Order Lifecycle State
 * 
 * Run with:
 *   npx medusa exec ./src/scripts/repair-vendor-order-lifecycle-state.ts
 * 
 * Safe, idempotent script that synchronizes all database stored VendorOrders
 * with their parent native Medusa fulfillments. It sets ready_to_ship, shipped,
 * or delivered canonical statuses and attaches native fulfillment IDs.
 */

import { MedusaContainer } from "@medusajs/framework"
import { MARKETPLACE_MODULE } from "../modules/marketplace/index.js"
import { syncVendorOrderFulfillmentState } from "../utils/marketplace/sync-vendor-fulfillment-state.js"

export default async function repairVendorOrdersState({
  container,
}: {
  container: MedusaContainer
}) {
  console.log("[VENDOR_REPAIR_START] Starting repair runner...")

  const marketplaceService: any = container.resolve(MARKETPLACE_MODULE)
  let processedCount = 0
  let updatedCount = 0
  let skippedCount = 0
  let errorCount = 0

  try {
    const [orders, count] = await marketplaceService.listAndCountVendorOrders({}, {
      relations: ["items"]
    })

    console.log(`[VENDOR_REPAIR_START] Found ${count} vendor orders in database to inspect.`)

    for (const order of orders) {
      processedCount++
      try {
        const previousStatus = order.status
        const previousFulfillStatus = order.fulfillment_status
        const previousFulfillmentId = order.metadata?.fulfillment_id

        const synced = await syncVendorOrderFulfillmentState(container, order)

        if (
          synced.status !== previousStatus ||
          synced.fulfillment_status !== previousFulfillStatus ||
          synced.metadata?.fulfillment_id !== previousFulfillmentId
        ) {
          console.log(`[REPAIR] Updated order ${order.id}: ${previousStatus}/${previousFulfillStatus} -> ${synced.status}/${synced.fulfillment_status}`)
          updatedCount++
        } else {
          skippedCount++
        }
      } catch (orderErr: any) {
        console.error(`[REPAIR_ERROR] Failed to repair order ${order.id}:`, orderErr?.message || orderErr)
        errorCount++
      }
    }

    console.log(`[VENDOR_REPAIR_COMPLETE] Run summary:`)
    console.log(`- Total processed: ${processedCount}`)
    console.log(`- Updated: ${updatedCount}`)
    console.log(`- Skipped: ${skippedCount}`)
    console.log(`- Errors: ${errorCount}`)

  } catch (err: any) {
    console.error("[VENDOR_REPAIR_FATAL] Failed to list vendor orders:", err?.message || err)
  }
}
