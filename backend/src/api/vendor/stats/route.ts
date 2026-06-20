// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

const asArray = (value: any) => {
  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const vendor = (req as any).vendor
  const query = req.scope.resolve("query")

  try {
    const { data: vendorData } = await query.graph({
      entity: "vendor",
      fields: [
        "product.id",
        "product.variants.id",
      ],
      filters: { id: vendor.id },
    })

    const vendorProducts = asArray(vendorData?.[0]?.product)
    const productIds = vendorProducts.map((product: any) => product.id).filter(Boolean)
    const variantIds = vendorProducts
      .flatMap((product: any) => asArray(product.variants))
      .map((variant: any) => variant.id)
      .filter(Boolean)

    if (!productIds.length && !variantIds.length) {
      return res.json({
        stats: {
          revenue: 0,
          orders: 0,
          products: 0,
          avgOrderValue: 0,
        },
      })
    }

    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "status",
        "items.product_id",
        "items.variant_id",
        "items.unit_price",
        "items.quantity",
      ],
      pagination: {
        take: 500,
      },
    })

    let totalRevenue = 0
    let vendorOrdersCount = 0

    for (const order of orders || []) {
      if (order.status === "canceled") {
        continue
      }

      const vendorItems = asArray(order.items).filter((item: any) => {
        return (
          (item.variant_id && variantIds.includes(item.variant_id)) ||
          (item.product_id && productIds.includes(item.product_id))
        )
      })

      if (!vendorItems.length) {
        continue
      }

      vendorOrdersCount++
      totalRevenue += vendorItems.reduce((sum: number, item: any) => {
        return sum + Number(item.unit_price || 0) * Number(item.quantity || 0)
      }, 0)
    }

    const revenue = totalRevenue / 100
    const avgOrderValue = vendorOrdersCount ? revenue / vendorOrdersCount : 0

    return res.json({
      stats: {
        revenue,
        orders: vendorOrdersCount,
        products: productIds.length,
        avgOrderValue: Number(avgOrderValue.toFixed(2)),
      },
    })
  } catch (error: any) {
    console.error("Error calculating vendor stats:", error)
    return res.status(500).json({
      message: error.message || "Failed to calculate stats",
    })
  }
}
