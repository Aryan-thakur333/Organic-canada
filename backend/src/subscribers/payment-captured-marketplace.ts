import { type SubscriberConfig, type SubscriberArgs } from "@medusajs/framework"
import { MARKETPLACE_MODULE } from "../modules/marketplace/index"

export default async function paymentCapturedMarketplaceSync({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const orderId = data.id

  console.log(`[Marketplace Sync] payment_captured fired for order ${orderId}`)

  try {
    const marketplaceService: any = container.resolve(MARKETPLACE_MODULE)

    // Find all VendorOrders for this parent order
    const vendorOrders = await marketplaceService.listVendorOrders({
      order_id: orderId,
    })

    if (!vendorOrders || vendorOrders.length === 0) {
      console.log(`[Marketplace Sync] No VendorOrders found for order ${orderId}`)
      return
    }

    for (const vo of vendorOrders) {
      if (vo.payment_status !== "captured") {
        await marketplaceService.updateVendorOrders({
          id: vo.id,
          payment_status: "captured",
        })
        console.log(`[Marketplace Sync] VendorOrder ${vo.id} payment_status → captured`)
      }
    }
  } catch (error: any) {
    // Non-fatal — do not block payment processing
    console.error(
      `[Marketplace Sync] Error syncing payment_captured for order ${orderId}:`,
      error?.message
    )
  }
}

export const config: SubscriberConfig = {
  event: "order.payment_captured",
}
