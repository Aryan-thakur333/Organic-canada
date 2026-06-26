// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../../modules/vendor"
import { Modules } from "@medusajs/framework/utils"

const asArray = (value: any) => {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

const monthKey = (value: string | Date | null | undefined) => {
  if (!value) return ""
  if (typeof value === "string") return value.slice(0, 7)

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  return date.toISOString().slice(0, 7)
}

/**
 * GET /admin/vendor-products/:id
 *
 * Returns detailed analytics for a single vendor by their ID.
 * Includes: revenue, order count, product sales, best sellers,
 * revenue by month, status breakdown, and inventory alerts.
 *
 * Response shape:
 * {
 *   vendor: { ... vendor details },
 *   analytics: {
 *     revenue, orders, products, avgOrderValue,
 *     pendingOrders, revenueGrowth, orderGrowth,
 *     statusBreakdown, revenueByMonth, bestSellers,
 *     lowStockAlerts, monthlySalesData
 *   }
 * }
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params

  try {
    const vendorService: any = req.scope.resolve(VENDOR_MODULE)
    const query: any = req.scope.resolve("query")

    // ── 1. Verify vendor exists ──────────────────────────────────────────
    let vendor
    try {
      vendor = await vendorService.retrieveVendor(id, {
        select: ["id", "name", "store_name", "email", "description", "status", "created_at"],
      })
    } catch {
      return res.status(404).json({ message: "Vendor not found" })
    }

    // ── 2. Get vendor products and variant IDs ───────────────────────────
    const { data: vendorData } = await query.graph({
      entity: "vendor",
      fields: [
        "product.id",
        "product.title",
        "product.thumbnail",
        "product.variants.id",
      ],
      filters: { id },
    })

    const products = asArray(vendorData?.[0]?.product)
    const productIds = new Set(products.map((p: any) => p.id))
    const variantIds = new Set(
      products.flatMap((p: any) => asArray(p.variants).map((v: any) => v.id))
    )

    if (!productIds.size && !variantIds.size) {
      return res.json({
        vendor: { id, name: vendor.store_name || vendor.name },
        analytics: {
          revenue: 0,
          orders: 0,
          products: 0,
          avgOrderValue: 0,
          pendingOrders: 0,
          revenueGrowth: 0,
          orderGrowth: 0,
          statusBreakdown: { pending: 0, processing: 0, fulfilled: 0, completed: 0, canceled: 0 },
          revenueByMonth: [],
          bestSellers: [],
          lowStockAlerts: 0,
          monthlySalesData: [],
          totalProducts: 0,
          topVendorProducts: [],
        },
      })
    }

    // ── 3. Fetch orders containing vendor items ──────────────────────────
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "status",
        "fulfillment_status",
        "payment_status",
        "created_at",
        "currency_code",
        "items.id",
        "items.product_id",
        "items.variant_id",
        "items.title",
        "items.unit_price",
        "items.quantity",
        "items.thumbnail",
      ],
      pagination: { take: 500 },
    })

    // ── 4. Filter to ONLY vendor's items ─────────────────────────────────
    const vendorOrders: any[] = []
    for (const order of orders || []) {
      const vendorItems = asArray(order.items).filter((item: any) =>
        (item.variant_id && variantIds.has(item.variant_id)) ||
        (item.product_id && productIds.has(item.product_id))
      )
      if (!vendorItems.length) continue
      const vendorSubtotal = vendorItems.reduce(
        (sum: number, item: any) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0),
        0
      )
      vendorOrders.push({ ...order, vendorItems, vendorSubtotal })
    }

    // ── 5. Compute stats ────────────────────────────────────────────────
    let totalRevenue = 0
    const statusBreakdown: Record<string, number> = {
      pending: 0, processing: 0, fulfilled: 0, completed: 0, canceled: 0,
    }
    const revenueByMonth: Record<string, number> = {}
    const productSales: Record<string, {
      title: string; thumbnail: string; revenue: number; quantity: number; id: string
    }> = {}
    let thisMonthRevenue = 0
    let lastMonthRevenue = 0
    let thisMonthOrders = 0
    let lastMonthOrders = 0
    const now = new Date()
    const currentMonth = monthKey(now.toISOString())
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevMonth = monthKey(lastMonthDate.toISOString())

    for (const order of vendorOrders) {
      const status = order.status || "pending"
      if (status !== "canceled") {
        totalRevenue += order.vendorSubtotal
      }

      if (statusBreakdown[status] !== undefined) {
        statusBreakdown[status]++
      }

      const mk = monthKey(order.created_at)
      if (mk) {
        revenueByMonth[mk] = (revenueByMonth[mk] || 0) + order.vendorSubtotal
        if (mk === currentMonth) {
          thisMonthRevenue += order.vendorSubtotal
          thisMonthOrders++
        } else if (mk === prevMonth) {
          lastMonthRevenue += order.vendorSubtotal
          lastMonthOrders++
        }
      }

      if (status !== "canceled") {
        for (const item of order.vendorItems) {
          const pid = item.product_id
          if (!pid) continue
          if (!productSales[pid]) {
            const product = products.find((p: any) => p.id === pid)
            productSales[pid] = {
              id: pid,
              title: product?.title || item.title || "Unknown",
              thumbnail: product?.thumbnail || "",
              revenue: 0,
              quantity: 0,
            }
          }
          productSales[pid].revenue += Number(item.unit_price || 0) * Number(item.quantity || 0)
          productSales[pid].quantity += Number(item.quantity || 0)
        }
      }
    }

    const revenue = totalRevenue / 100
    const vendorOrdersCount = vendorOrders.filter((o) => o.status !== "canceled").length
    const avgOrderValue = vendorOrdersCount ? revenue / vendorOrdersCount : 0
    const pendingOrders = vendorOrders.filter((o) => o.status === "pending").length
    const revenueGrowth = lastMonthRevenue
      ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
      : 0
    const orderGrowth = lastMonthOrders
      ? ((thisMonthOrders - lastMonthOrders) / lastMonthOrders) * 100
      : 0

    // Best sellers sorted by revenue
    const bestSellers = Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
      .map((p) => ({
        ...p,
        revenue: p.revenue / 100,
      }))

    // Revenue by month (sorted)
    const revenueChart = Object.keys(revenueByMonth)
      .sort()
      .map((month) => ({
        month,
        revenue: revenueByMonth[month] / 100,
      }))

    // Monthly sales data (for charts)
    const monthlySalesData = Object.keys(revenueByMonth)
      .sort()
      .map((month) => ({
        month,
        revenue: revenueByMonth[month] / 100,
        orders: vendorOrders.filter((o) => monthKey(o.created_at) === month).length,
      }))

    // ── 6. Inventory alerts ──────────────────────────────────────────────
    let lowStockAlerts = 0
    try {
      const stockService: any = req.scope.resolve(Modules.INVENTORY)
      for (const product of products) {
        for (const variant of asArray(product.variants)) {
          const inventoryItems = await stockService.listInventoryItems({ sku: variant.sku || undefined })
          for (const inv of inventoryItems) {
            const levels = await stockService.listInventoryLevels({ inventory_item_id: inv.id })
            for (const level of levels) {
              const available = Number(level.stocked_quantity || 0) - Number(level.reserved_quantity || 0)
              if (available <= 5) lowStockAlerts++
            }
          }
        }
      }
    } catch {
      // inventory service may not be available
    }

    // ── 7. Product catalog info ──────────────────────────────────────────
    const topVendorProducts = products.map((p: any) => ({
      id: p.id,
      title: p.title,
      thumbnail: p.thumbnail,
      variants: asArray(p.variants).length,
      sales: productSales[p.id]
        ? { revenue: productSales[p.id].revenue / 100, quantity: productSales[p.id].quantity }
        : { revenue: 0, quantity: 0 },
    }))

    return res.json({
      vendor: {
        id: vendor.id,
        name: vendor.store_name || vendor.name,
        email: vendor.email,
        status: vendor.status,
        created_at: vendor.created_at,
      },
      analytics: {
        revenue,
        orders: vendorOrdersCount,
        products: products.length,
        avgOrderValue: Number(avgOrderValue.toFixed(2)),
        pendingOrders,
        revenueGrowth: Number(revenueGrowth.toFixed(1)),
        orderGrowth: Number(orderGrowth.toFixed(1)),
        statusBreakdown,
        revenueByMonth: revenueChart,
        bestSellers,
        lowStockAlerts,
        monthlySalesData,
        totalProducts: products.length,
        topVendorProducts,
        totalRevenueCents: totalRevenue,
      },
    })
  } catch (error: any) {
    console.error("[Admin Vendor Analytics] Error:", error)
    return res.status(500).json({
      message: error.message || "Failed to compute vendor analytics",
    })
  }
}
