// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../modules/vendor"
import { asArray, getVendorProductIdSets } from "../_ownership"

const COMMISSION_RATE = 0.1

const safeNumber = (val: any, fallback = 0): number => {
  const n = Number(val)
  return Number.isFinite(n) ? n : fallback
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const vendor = (req as any).vendor

  try {
    const query: any = req.scope.resolve("query")
    const { productIds, variantIds } = await getVendorProductIdSets(query, vendor.id)

    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "status",
        "currency_code",
        "metadata",
        "items.product_id",
        "items.variant_id",
        "items.unit_price",
        "items.quantity",
      ],
      pagination: { take: 1000 },
    })

    let grossSales = 0
    let pendingRevenue = 0
    let completedRevenue = 0
    let orderCount = 0
    let currencyCode = "cad"

    for (const order of asArray(orders)) {
      if (order.status === "canceled") continue

      const vendorItems = asArray(order.items).filter(
        (item: any) =>
          productIds.has(item.product_id) || variantIds.has(item.variant_id)
      )

      if (vendorItems.length === 0) continue

      const itemTotal = vendorItems.reduce(
        (sum: number, item: any) =>
          sum + safeNumber(item.unit_price) * safeNumber(item.quantity),
        0
      )

      grossSales += itemTotal
      if (order.metadata?.vendor_fulfillment_status === "delivered") {
        completedRevenue += itemTotal
      } else {
        pendingRevenue += itemTotal
      }
      orderCount++
      currencyCode = order.currency_code || currencyCode
    }

    const vendorService: any = req.scope.resolve(VENDOR_MODULE)
    let payouts = []
    try {
      payouts = await vendorService.listPayoutRequests({ vendor_id: vendor.id })
    } catch (err) {
      console.error("[Vendor Earnings] Failed to fetch payouts:", err)
    }

    const pendingPayout = asArray(payouts)
      .filter((p: any) => ["pending", "approved"].includes(p.status))
      .reduce((sum: number, p: any) => sum + safeNumber(p.amount), 0)

    const completedPayout = asArray(payouts)
      .filter((p: any) => p.status === "paid")
      .reduce((sum: number, p: any) => sum + safeNumber(p.amount), 0)

    const commissionAmount = Math.round(grossSales * COMMISSION_RATE)
    const netEarnings = Math.max(0, grossSales - commissionAmount)

    // Convert to display currency (divide by 100 for cents→dollars)
    const displayGross = grossSales / 100
    const displayCommission = commissionAmount / 100
    const displayNet = netEarnings / 100
    const displayPending = Math.round(pendingRevenue * (1 - COMMISSION_RATE)) / 100
    const displayCompleted = Math.round(completedRevenue * (1 - COMMISSION_RATE)) / 100
    const displayPendingPayout = pendingPayout / 100
    const displayCompletedPayout = completedPayout / 100
    const displayAvailable = Math.max(0, displayNet - displayPendingPayout - displayCompletedPayout)

    return res.json({
      gross_sales: displayGross,
      commission_rate: Math.round(COMMISSION_RATE * 100),
      commission_amount: displayCommission,
      net_earnings: displayNet,
      pending_earnings: displayPending,
      available_earnings: displayAvailable,
      order_count: orderCount,
      currency_code: currencyCode,
      orders: [],
    })
  } catch (error: any) {
    console.error("Vendor earnings failed:", error)
    return res.status(500).json({
      gross_sales: 0,
      commission_rate: 10,
      commission_amount: 0,
      net_earnings: 0,
      pending_earnings: 0,
      available_earnings: 0,
      order_count: 0,
      currency_code: "cad",
      orders: [],
      message: error.message || "Failed to calculate earnings",
    })
  }
}
