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

    const products = asArray(vendorData?.[0]?.product)
    const productIds = products.map((product: any) => product.id).filter(Boolean)
    const variantIds = products
      .flatMap((product: any) => asArray(product.variants))
      .map((variant: any) => variant.id)
      .filter(Boolean)

    if (!productIds.length && !variantIds.length) {
      return res.json({ orders: [] })
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
        "items.quantity",
        "items.unit_price",
      ],
      pagination: {
        take: 500,
      },
    })

    const sandboxedOrders = asArray(orders)
      .map((order: any) => {
        const vendorItems = asArray(order.items).filter((item: any) => {
          return (
            (item.variant_id && variantIds.includes(item.variant_id)) ||
            (item.product_id && productIds.includes(item.product_id))
          )
        })

        if (!vendorItems.length) {
          return null
        }

        const vendorSubtotal = vendorItems.reduce((sum: number, item: any) => {
          return sum + Number(item.unit_price || 0) * Number(item.quantity || 0)
        }, 0)

        return {
          id: order.id,
          display_id: order.display_id,
          status: order.status,
          created_at: order.created_at,
          currency_code: order.currency_code,
          items: vendorItems,
          vendor_subtotal: vendorSubtotal / 100,
        }
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })

    return res.json({ orders: sandboxedOrders })
  } catch (error: any) {
    console.error("Error fetching vendor orders:", error)
    return res.status(500).json({
      message: error.message || "Failed to fetch orders",
    })
  }
}
