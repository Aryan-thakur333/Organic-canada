import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../modules/vendor"

const asArray = (value: any): any[] => {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

/**
 * GET /admin/marketplace-overview
 *
 * Returns aggregated marketplace metrics for the admin dashboard:
 * vendor health breakdown, product counts, revenue snapshot,
 * and vendor rankings based on completed-order product authorship.
 *
 * Uses Medusa v2's Remote Query API (query.graph) and the vendor
 * service to fetch real-time data from existing relational schemas.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const query: any = req.scope.resolve("query")
    const vendorService: any = req.scope.resolve(VENDOR_MODULE)

    // ── 1. Fetch all vendors ─────────────────────────────────────────────
    const vendors = await vendorService.listVendors(
      {},
      {
        select: [
          "id",
          "name",
          "store_name",
          "email",
          "description",
          "company_details",
          "status",
          "created_at",
        ],
      }
    )

    const safeVendors: any[] = Array.isArray(vendors) ? vendors : []

    // ── 2. Fetch all vendor → product links via Remote Query ──────────────
    const { data: vendorProducts } = await query.graph({
      entity: "vendor",
      fields: [
        "id",
        "product.id",
        "product.title",
        "product.handle",
        "product.status",
        "product.thumbnail",
        "product.created_at",
      ],
    })

    const safeVendorProducts: any[] = Array.isArray(vendorProducts)
      ? vendorProducts
      : []

    // ── 3. Build vendor → product map ────────────────────────────────────
    const vendorProductMap: Record<
      string,
      { id: string; title: string; handle: string; status: string; thumbnail: string | null; created_at: string }[]
    > = {}

    for (const entry of safeVendorProducts) {
      const vid = entry.id
      if (!vid) continue
      const products = asArray(entry.product)
      if (!vendorProductMap[vid]) {
        vendorProductMap[vid] = []
      }
      for (const p of products) {
        if (p?.id) {
          vendorProductMap[vid].push({
            id: p.id,
            title: p.title || "Untitled",
            handle: p.handle || "",
            status: p.status || "draft",
            thumbnail: p.thumbnail || null,
            created_at: p.created_at || "",
          })
        }
      }
    }

    // ── 4. Fetch completed orders to compute vendor rankings ──────────────
    const { data: orderData } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "status",
        "total",
        "created_at",
        "items.id",
        "items.product_id",
        "items.title",
        "items.unit_price",
        "items.quantity",
        "items.thumbnail",
      ],
      filters: {
        status: ["completed"],
      },
      pagination: { take: 1000 },
    })

    const safeOrders: any[] = Array.isArray(orderData) ? orderData : []

    // Build reverse lookup: product_id → vendor_id
    const productToVendor: Record<string, string> = {}
    for (const vid of Object.keys(vendorProductMap)) {
      for (const p of vendorProductMap[vid]) {
        productToVendor[p.id] = vid
      }
    }

    // Compute vendor performance from completed orders
    const vendorPerformance: Record<
      string,
      {
        vendor_id: string
        vendor_name: string
        total_revenue_cents: number
        total_orders: number
        total_items_sold: number
        product_count: number
      }
    > = {}

    for (const v of safeVendors) {
      vendorPerformance[v.id] = {
        vendor_id: v.id,
        vendor_name: v.store_name || v.name || "Unknown",
        total_revenue_cents: 0,
        total_orders: 0,
        total_items_sold: 0,
        product_count: vendorProductMap[v.id]?.length || 0,
      }
    }

    // Track which vendors appear in which orders (for order count)
    const vendorOrderSet: Record<string, Set<string>> = {}

    for (const order of safeOrders) {
      const items = asArray(order.items)
      const vendorsInOrder = new Set<string>()

      for (const item of items) {
        if (!item?.product_id) continue
        const vid = productToVendor[item.product_id]
        if (!vid) continue

        vendorsInOrder.add(vid)
        const unitPrice = Number(item.unit_price || 0)
        const qty = Number(item.quantity || 0)
        vendorPerformance[vid].total_revenue_cents += unitPrice * qty
        vendorPerformance[vid].total_items_sold += qty
      }

      for (const vid of vendorsInOrder) {
        if (!vendorOrderSet[vid]) vendorOrderSet[vid] = new Set()
        vendorOrderSet[vid].add(order.id)
      }
    }

    // Set order counts from the deduplicated sets
    for (const vid of Object.keys(vendorOrderSet)) {
      if (vendorPerformance[vid]) {
        vendorPerformance[vid].total_orders = vendorOrderSet[vid].size
      }
    }

    // ── 5. Compute health breakdown ──────────────────────────────────────
    const vendorHealth = {
      total: safeVendors.length,
      pending: safeVendors.filter((v) => v.status === "pending").length,
      approved: safeVendors.filter((v) => v.status === "approved").length,
      rejected: safeVendors.filter((v) => v.status === "rejected").length,
      suspended: safeVendors.filter((v) => v.status === "suspended").length,
    }

    // ── 6. Compute aggregate marketplace stats ───────────────────────────
    const totalProducts = Object.values(vendorProductMap).reduce(
      (sum, products) => sum + products.length,
      0
    )

    let totalMarketplaceRevenueCents = 0
    let totalCompletedOrders = 0

    for (const vp of Object.values(vendorPerformance)) {
      totalMarketplaceRevenueCents += vp.total_revenue_cents
      totalCompletedOrders += vp.total_orders
    }

    // Vendor rankings (by revenue, descending)
    const vendorRankings = Object.values(vendorPerformance)
      .sort((a, b) => b.total_revenue_cents - a.total_revenue_cents)
      .map((vp, index) => ({
        rank: index + 1,
        vendor_id: vp.vendor_id,
        vendor_name: vp.vendor_name,
        revenue_cents: vp.total_revenue_cents,
        revenue: (vp.total_revenue_cents / 100).toFixed(2),
        order_count: vp.total_orders,
        items_sold: vp.total_items_sold,
        product_count: vp.product_count,
      }))

    // ── 7. Vendor fast-stats list (for UI table) ─────────────────────────
    const vendorStatsList = safeVendors.map((v) => {
      const perf = vendorPerformance[v.id] || {
        total_revenue_cents: 0,
        total_orders: 0,
        total_items_sold: 0,
        product_count: 0,
      }
      return {
        id: v.id,
        name: v.store_name || v.name || "Unknown",
        email: v.email,
        handle: "", // Vendors don't have handles; product handles used in product map
        status: v.status,
        created_at: v.created_at,
        product_count: vendorProductMap[v.id]?.length || 0,
        total_revenue_cents: perf.total_revenue_cents,
        total_orders: perf.total_orders,
        total_items_sold: perf.total_items_sold,
      }
    })

    return res.json({
      marketplace: {
        vendor_health: vendorHealth,
        total_products: totalProducts,
        total_revenue_cents: totalMarketplaceRevenueCents,
        total_revenue: (totalMarketplaceRevenueCents / 100).toFixed(2),
        total_completed_orders: totalCompletedOrders,
        vendor_rankings: vendorRankings,
        vendors: vendorStatsList,
      },
    })
  } catch (error: any) {
    console.error("[Marketplace Overview] Error:", error)
    return res
      .status(500)
      .json({ message: error.message || "Failed to load marketplace overview" })
  }
}
