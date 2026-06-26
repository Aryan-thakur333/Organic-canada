// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { safeNumber, safeDivide, asArray } from "../../../utils/as-array"
import { getVendorOwnedProducts } from "../_ownership"

const monthKey = (value: string | Date | null | undefined): string => {
  if (!value) return ""
  if (typeof value === "string") return value.slice(0, 7)
  try {
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return ""
    return date.toISOString().slice(0, 7)
  } catch {
    return ""
  }
}

const EMPTY_STATS = () => ({
  total_sales: 0,
  orders_count: 0,
  active_products: 0,
  average_order_value: 0,
  pending_orders: 0,
  low_stock_items: 0,
  best_sellers: [],
  revenue_trend: [],
  revenue: 0,
  orders: 0,
  products: 0,
  avgOrderValue: 0,
  pendingOrders: 0,
  revenueGrowth: 0,
  orderGrowth: 0,
  statusBreakdown: { pending: 0, processing: 0, fulfilled: 0, completed: 0, canceled: 0 },
  revenueByMonth: [],
  lowStockAlerts: 0,
})

async function getVendorProductData(query: any, vendorId: string) {
  try {
    const products = await getVendorOwnedProducts(query, vendorId, [
      "thumbnail",
      "variants.id",
      "variants.sku",
    ])

    const productsArray = asArray(products)
    const productIds = new Set<string>()
    const variantIds = new Set<string>()

    for (const product of productsArray) {
      if (product?.id) productIds.add(product.id)
      const variants = asArray(product?.variants)
      for (const variant of variants) {
        if (variant?.id) variantIds.add(variant.id)
      }
    }

    return { products: productsArray, productIds, variantIds }
  } catch (error) {
    console.error("[Vendor Stats] Error getting product data:", error)
    return { products: [], productIds: new Set(), variantIds: new Set() }
  }
}

function extractVendorOrders(orders: any[], productIds: Set<string>, variantIds: Set<string>) {
  const vendorOrders: any[] = []
  const ordersArray = asArray(orders)

  for (const order of ordersArray) {
    if (!order) continue
    const items = asArray(order.items)
    const vendorItems = items.filter((item: any) =>
      (item?.variant_id && variantIds.has(item.variant_id)) ||
      (item?.product_id && productIds.has(item.product_id))
    )
    if (!vendorItems.length) continue
    const vendorSubtotal = vendorItems.reduce(
      (sum: number, item: any) => sum + safeNumber(item?.unit_price, 0) * safeNumber(item?.quantity, 0),
      0
    )
    vendorOrders.push({ ...order, vendorItems, vendorSubtotal })
  }

  return vendorOrders
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const vendor = (req as any).vendor
  if (!vendor?.id) {
    return res.status(401).json({ stats: EMPTY_STATS(), message: "Authentication required" })
  }

  const query = req.scope.resolve("query")
  if (!query) {
    return res.json({ stats: EMPTY_STATS() })
  }

  try {
    const { products, productIds, variantIds } = await getVendorProductData(query, vendor.id)

    if (!productIds.size && !variantIds.size) {
      return res.json({ stats: EMPTY_STATS() })
    }

    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "status",
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

    const vendorOrders = extractVendorOrders(orders || [], productIds, variantIds)

    let totalRevenueCents = 0
    const statusBreakdown: Record<string, number> = {
      pending: 0, processing: 0, fulfilled: 0, completed: 0, canceled: 0,
    }
    const revenueByMonth: Record<string, number> = {}
    const productSales: Record<string, any> = {}
    let nonCanceledCount = 0

    for (const order of vendorOrders) {
      const status = order.status || "pending"

      if (status !== "canceled") {
        totalRevenueCents += order.vendorSubtotal
        nonCanceledCount++
      }

      if (status in statusBreakdown) {
        statusBreakdown[status]++
      }

      const mk = monthKey(order.created_at)
      if (mk) {
        revenueByMonth[mk] = safeNumber(revenueByMonth[mk], 0) + order.vendorSubtotal
      }

      if (status !== "canceled") {
        for (const item of asArray(order.vendorItems)) {
          const pid = item?.product_id
          if (!pid) continue
          if (!productSales[pid]) {
            const product = products.find((p: any) => p?.id === pid)
            productSales[pid] = {
              id: pid,
              title: product?.title || item?.title || "Unknown",
              thumbnail: product?.thumbnail || "",
              revenue_cents: 0,
              quantity: 0,
            }
          }
          productSales[pid].revenue_cents += safeNumber(item?.unit_price, 0) * safeNumber(item?.quantity, 0)
          productSales[pid].quantity += safeNumber(item?.quantity, 0)
        }
      }
    }

    const revenue = safeDivide(totalRevenueCents, 100)
    const avgOrderValue = nonCanceledCount > 0 ? safeDivide(totalRevenueCents / 100, nonCanceledCount) : 0
    const pendingOrders = vendorOrders.filter((o) => o.status === "pending").length

    const bestSellers = Object.values(productSales)
      .sort((a: any, b: any) => safeNumber(b?.revenue_cents, 0) - safeNumber(a?.revenue_cents, 0))
      .slice(0, 10)
      .map((p: any) => ({
        id: p.id,
        title: p.title,
        thumbnail: p.thumbnail,
        revenue: safeDivide(p.revenue_cents, 100),
        quantity: p.quantity,
      }))

    const sortedMonths = Object.keys(revenueByMonth).sort()
    const revenueChart = sortedMonths.map((month) => ({
      month,
      revenue: safeDivide(revenueByMonth[month], 100),
    }))

    // Low stock count (best-effort)
    let lowStockAlerts = 0
    try {
      const stockService: any = req.scope.resolve(Modules.INVENTORY)
      if (stockService) {
        for (const product of products) {
          const variants = asArray(product?.variants)
          for (const variant of variants) {
            if (!variant?.sku) continue
            const inventoryItems = await stockService.listInventoryItems({ sku: variant.sku })
            const invArray = asArray(inventoryItems)
            for (const inv of invArray) {
              if (!inv?.id) continue
              const levels = await stockService.listInventoryLevels({ inventory_item_id: inv.id })
              const levelsArray = asArray(levels)
              for (const level of levelsArray) {
                const available = safeNumber(level?.stocked_quantity, 0) - safeNumber(level?.reserved_quantity, 0)
                if (available <= 5) lowStockAlerts++
              }
            }
          }
        }
      }
    } catch {
      // Non-fatal
    }

    return res.json({
      stats: {
        total_sales: revenue,
        orders_count: nonCanceledCount,
        active_products: products.length,
        average_order_value: safeNumber(avgOrderValue.toFixed(2), 0),
        pending_orders: pendingOrders,
        low_stock_items: lowStockAlerts,
        best_sellers: bestSellers,
        revenue_trend: revenueChart,
        // Legacy field names for backward compat
        revenue,
        orders: nonCanceledCount,
        products: products.length,
        avgOrderValue: safeNumber(avgOrderValue.toFixed(2), 0),
        pendingOrders,
        revenueGrowth: 0,
        orderGrowth: 0,
        statusBreakdown,
        revenueByMonth: revenueChart,
        lowStockAlerts,
      },
    })
  } catch (error: any) {
    console.error("Error calculating vendor stats:", error)
    return res.status(500).json({
      stats: EMPTY_STATS(),
      message: error.message || "Failed to calculate stats",
    })
  }
}
