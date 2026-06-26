import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../modules/vendor"

const asArray = (value: any): any[] => {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

// GET /admin/analytics — aggregated store analytics for the admin dashboard
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const query: any = req.scope.resolve("query")
    const vendorService: any = req.scope.resolve(VENDOR_MODULE)

    // ── Fetch orders ─────────────────────────────────────────────────────
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "email",
        "currency_code",
        "total",
        "subtotal",
        "status",
        "payment_status",
        "fulfillment_status",
        "created_at",
        "items.id",
        "items.title",
        "items.product_id",
        "items.quantity",
        "items.unit_price",
        "items.thumbnail",
      ],
    })

    const orderList: any[] = asArray(orders)
    const processedOrders = orderList.filter((o: any) => o.status !== "canceled")

    // ── Build product_id → vendor_id map for cross-vendor splits ──────────
    const productToVendor: Record<string, { vendor_id: string; vendor_name: string }> = {}

    try {
      const vendors = await vendorService.listVendors(
        {},
        { select: ["id", "name", "store_name", "status"] }
      )
      const safeVendors: any[] = asArray(vendors)
      const vendorNameMap: Record<string, string> = {}
      for (const v of safeVendors) {
        vendorNameMap[v.id] = v.store_name || v.name || "Unknown"
      }

      const { data: vendorProducts } = await query.graph({
        entity: "vendor",
        fields: ["id", "product.id"],
      })

      const safeVP: any[] = asArray(vendorProducts)
      for (const entry of safeVP) {
        const vid = entry.id
        if (!vid || !vendorNameMap[vid]) continue
        const products = asArray(entry.product)
        for (const p of products) {
          if (p?.id) {
            productToVendor[p.id] = {
              vendor_id: vid,
              vendor_name: vendorNameMap[vid],
            }
          }
        }
      }
    } catch {
      // Vendor module may not be available — splits will be empty
    }

    // ── Compute cross-vendor performance splits ───────────────────────────
    const vendorPerformanceSplits: Record<
      string,
      {
        vendor_id: string
        vendor_name: string
        total_revenue_cents: number
        total_orders: number
        total_items: number
        order_ids: string[]
      }
    > = {}

    const vendorOrderSet: Record<string, Set<string>> = {}

    for (const order of processedOrders) {
      const items = asArray(order.items)
      const vendorIdsInOrder = new Set<string>()

      for (const item of items) {
        const pid = item.product_id
        if (!pid) continue
        const mapping = productToVendor[pid]
        if (!mapping) continue

        const vid = mapping.vendor_id
        vendorIdsInOrder.add(vid)

        if (!vendorPerformanceSplits[vid]) {
          vendorPerformanceSplits[vid] = {
            vendor_id: vid,
            vendor_name: mapping.vendor_name,
            total_revenue_cents: 0,
            total_orders: 0,
            total_items: 0,
            order_ids: [],
          }
        }

        const unitPrice = Number(item.unit_price || 0)
        const qty = Number(item.quantity || 0)

        // Calculate split amount: (unit_price * quantity) / 100 to convert cents to dollars
        vendorPerformanceSplits[vid].total_revenue_cents += unitPrice * qty
        vendorPerformanceSplits[vid].total_items += qty
      }

      // Track which vendors appear in this order (deduplicated)
      for (const vid of vendorIdsInOrder) {
        if (!vendorOrderSet[vid]) vendorOrderSet[vid] = new Set()
        vendorOrderSet[vid].add(order.id)
      }
    }

    // Finalize order counts and IDs
    for (const vid of Object.keys(vendorOrderSet)) {
      if (vendorPerformanceSplits[vid]) {
        vendorPerformanceSplits[vid].total_orders = vendorOrderSet[vid].size
        vendorPerformanceSplits[vid].order_ids = Array.from(vendorOrderSet[vid])
      }
    }

    const vendorPerformanceSplitsArray = Object.values(vendorPerformanceSplits)
      .sort((a, b) => b.total_revenue_cents - a.total_revenue_cents)
      .map((vps) => ({
        ...vps,
        total_revenue_dollars: (vps.total_revenue_cents / 100).toFixed(2),
      }))

    // ── Total revenue ────────────────────────────────────────────────────
    const totalRevenue = processedOrders.reduce(
      (sum: number, o: any) => sum + (o.total || 0),
      0
    )
    const totalOrders = orderList.length
    const activeOrders = orderList.filter(
      (o: any) => o.status !== "canceled" && o.status !== "completed"
    ).length
    const aov = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0

    // ── Revenue by month (last 12 months) ─────────────────────────────────
    const revenueByMonth: { month: string; revenue: number; orders: number }[] = []
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      const monthOrders = processedOrders.filter((o: any) => {
        if (!o.created_at) return false
        const created = new Date(o.created_at)
        return (
          created.getFullYear() === d.getFullYear() &&
          created.getMonth() === d.getMonth()
        )
      })
      revenueByMonth.push({
        month: monthKey,
        revenue: monthOrders.reduce((sum: number, o: any) => sum + (o.total || 0), 0),
        orders: monthOrders.length,
      })
    }

    // ── Order status breakdown ────────────────────────────────────────────
    const statusBreakdown: Record<string, number> = {}
    for (const o of orderList) {
      statusBreakdown[o.status] = (statusBreakdown[o.status] || 0) + 1
    }

    // ── Top products by revenue ────────────────────────────────────────────
    const productRevenue: Record<
      string,
      { title: string; revenue: number; quantity: number; thumbnail: string | null }
    > = {}
    for (const o of processedOrders) {
      for (const item of o.items || []) {
        const key = item.title || item.id
        if (!productRevenue[key]) {
          productRevenue[key] = {
            title: item.title || "Unknown",
            revenue: 0,
            quantity: 0,
            thumbnail: item.thumbnail || null,
          }
        }
        productRevenue[key].revenue += (item.unit_price || 0) * (item.quantity || 1)
        productRevenue[key].quantity += item.quantity || 1
      }
    }

    const topProducts = Object.values(productRevenue)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)

    // ── Recent orders ──────────────────────────────────────────────────────
    const recentOrders = orderList
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 20)
      .map((o: any) => ({
        id: o.id,
        display_id: o.display_id,
        email: o.email,
        total: o.total,
        status: o.status,
        payment_status: o.payment_status,
        fulfillment_status: o.fulfillment_status,
        created_at: o.created_at,
        items_count: (o.items || []).length,
        items: (o.items || []).slice(0, 3).map((i: any) => ({
          title: i.title,
          quantity: i.quantity,
          thumbnail: i.thumbnail,
        })),
      }))

    // ── Vendor summary ─────────────────────────────────────────────────────
    let vendorSummary = {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      suspended: 0,
    }
    try {
      const vendors = await vendorService.listVendors({}, {
        select: ["id", "status"],
      })
      const safeVendors = asArray(vendors)
      vendorSummary = {
        total: safeVendors.length,
        pending: safeVendors.filter((v: any) => v.status === "pending").length,
        approved: safeVendors.filter((v: any) => v.status === "approved").length,
        rejected: safeVendors.filter((v: any) => v.status === "rejected").length,
        suspended: safeVendors.filter((v: any) => v.status === "suspended").length,
      }
    } catch {
      // Vendors module may not be registered — silently skip
    }

    // ── Payment stats ─────────────────────────────────────────────────────
    const paymentStatusBreakdown: Record<string, number> = {}
    for (const o of orderList) {
      const ps = o.payment_status || "pending"
      paymentStatusBreakdown[ps] = (paymentStatusBreakdown[ps] || 0) + 1
    }

    // ── Fulfillment stats ─────────────────────────────────────────────────
    const fulfillmentStatusBreakdown: Record<string, number> = {}
    for (const o of orderList) {
      const fs = o.fulfillment_status || "not_fulfilled"
      fulfillmentStatusBreakdown[fs] = (fulfillmentStatusBreakdown[fs] || 0) + 1
    }

    // ── Revenue growth (month-over-month) ──────────────────────────────────
    const currentMonth = revenueByMonth[revenueByMonth.length - 1] || { revenue: 0 }
    const previousMonth = revenueByMonth[revenueByMonth.length - 2] || { revenue: 0 }
    const revenueGrowth = previousMonth.revenue > 0
      ? ((currentMonth.revenue - previousMonth.revenue) / previousMonth.revenue) * 100
      : 0

    // ── Monthly vendor splits (by month) ──────────────────────────────────
    // For each month, also show per-vendor contribution
    const monthlyVendorSplits: {
      month: string
      vendor_breakdown: { vendor_id: string; vendor_name: string; revenue_cents: number; revenue_dollars: string }[]
    }[] = []

    if (Object.keys(productToVendor).length > 0) {
      for (const rm of revenueByMonth) {
        const monthOrders = processedOrders.filter((o: any) => {
          if (!o.created_at) return false
          const created = new Date(o.created_at)
          const d = new Date(
            Number(rm.month.slice(0, 4)),
            Number(rm.month.slice(5, 7)) - 1,
            1
          )
          return (
            created.getFullYear() === d.getFullYear() &&
            created.getMonth() === d.getMonth()
          )
        })

        const monthVendorRevenue: Record<string, { vendor_id: string; vendor_name: string; revenue_cents: number }> = {}

        for (const order of monthOrders) {
          const items = asArray(order.items)
          for (const item of items) {
            const pid = item.product_id
            if (!pid) continue
            const mapping = productToVendor[pid]
            if (!mapping) continue

            if (!monthVendorRevenue[mapping.vendor_id]) {
              monthVendorRevenue[mapping.vendor_id] = {
                vendor_id: mapping.vendor_id,
                vendor_name: mapping.vendor_name,
                revenue_cents: 0,
              }
            }
            monthVendorRevenue[mapping.vendor_id].revenue_cents +=
              Number(item.unit_price || 0) * Number(item.quantity || 0)
          }
        }

        monthlyVendorSplits.push({
          month: rm.month,
          vendor_breakdown: Object.values(monthVendorRevenue)
            .sort((a, b) => b.revenue_cents - a.revenue_cents)
            .map((vb) => ({
              ...vb,
              revenue_dollars: (vb.revenue_cents / 100).toFixed(2),
            })),
        })
      }
    }

    return res.json({
      analytics: {
        totalRevenue,
        totalOrders,
        activeOrders,
        aov,
        revenueGrowth: Math.round(revenueGrowth * 100) / 100,
        revenueByMonth,
        statusBreakdown,
        paymentStatusBreakdown,
        fulfillmentStatusBreakdown,
        topProducts,
        recentOrders,
        vendorSummary,
        // New cross-vendor split data
        vendor_performance_splits: vendorPerformanceSplitsArray,
        monthly_vendor_splits: monthlyVendorSplits,
      },
    })
  } catch (error: any) {
    console.error("[Admin Analytics] Error:", error)
    return res.status(500).json({ message: error.message || "Failed to load analytics" })
  }
}
