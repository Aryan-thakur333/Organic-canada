import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

export default async function couponCleanupJob(container: MedusaContainer) {
  const promotionService: any = container.resolve(Modules.PROMOTION)

  try {
    console.log("[Coupon Cleanup Job] Scanning for expired coupons...")
    const promotions = await promotionService.listPromotions({ status: "active" })
    const now = new Date()

    let count = 0
    for (const promo of promotions) {
      if (promo.valid_until && new Date(promo.valid_until) < now) {
        console.log(`[Coupon Cleanup Job] Disabling expired coupon: ${promo.code}`)
        await promotionService.updatePromotions({
          id: promo.id,
          status: "draft",
        })
        count++
      }
    }

    console.log(`[Coupon Cleanup Job] Disabled ${count} expired coupons.`)
  } catch (error: any) {
    console.error("[Coupon Cleanup Job] Failed to run coupon cleanup:", error.message)
  }
}

export const config = {
  name: "coupon-expiration-cleanup",
  schedule: "0 0 * * *", // Run daily at midnight
}
