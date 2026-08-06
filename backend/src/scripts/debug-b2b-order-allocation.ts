import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

const ORDER_FIELDS = [
  "id",
  "display_id",
  "email",
  "customer_id",
  "sales_channel_id",
  "region_id",
  "currency_code",
  "subtotal",
  "total",
  "shipping_total",
  "metadata",
  "shipping_address.*",
  "billing_address.*",
  "items.id",
  "items.title",
  "items.subtitle",
  "items.product_id",
  "items.product_title",
  "items.variant_id",
  "items.variant_title",
  "items.variant_sku",
  "items.quantity",
  "items.unit_price",
  "items.total",
  "items.metadata",
]

export default async function debugB2BOrderAllocation({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query: any = container.resolve("query")
  const orderId = process.env.ORDER_ID || process.env.B2B_ORDER_ID || null

  const { data } = await query.graph({
    entity: "order",
    fields: ORDER_FIELDS,
    filters: orderId
      ? { id: orderId }
      : { metadata: { source: "b2b_quote" } },
    pagination: { take: 1 },
  })

  const order = data?.[0]
  if (!order) {
    logger.warn(
      orderId
        ? `[debug-b2b-order-allocation] Order ${orderId} was not found`
        : "[debug-b2b-order-allocation] No B2B quote order was found"
    )
    return
  }

  logger.info("[debug-b2b-order-allocation] B2B quote order snapshot")
  logger.info(JSON.stringify({
    id: order.id,
    display_id: order.display_id,
    email: order.email,
    customer_id: order.customer_id,
    sales_channel_id: order.sales_channel_id,
    region_id: order.region_id,
    currency_code: order.currency_code,
    subtotal: order.subtotal,
    total: order.total,
    shipping_total: order.shipping_total,
    metadata: order.metadata,
    shipping_address: order.shipping_address,
    billing_address: order.billing_address,
    items: (order.items || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
      product_id: item.product_id,
      product_title: item.product_title,
      variant_id: item.variant_id,
      variant_title: item.variant_title,
      variant_sku: item.variant_sku,
      sku: item.metadata?.sku || item.metadata?.variant_sku || null,
      inventory_item_id: item.inventory_item_id || item.metadata?.inventory_item_id || null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: item.total,
      metadata: item.metadata,
    })),
  }, null, 2))
}
