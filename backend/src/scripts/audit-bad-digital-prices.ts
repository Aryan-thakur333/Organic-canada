import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

const CAD_UNREALISTIC_AMOUNT = Number(process.env.DIGITAL_PRICE_AUDIT_THRESHOLD_CENTS || 100000)

function isDigitalProduct(product: any): boolean {
  const metadata = product?.metadata || {}
  const typeValue = product?.type?.value || product?.type_value || ""
  return metadata.is_digital === true || metadata.is_digital === "true" || typeValue === "Digital Product"
}

function isDigitalOrder(order: any): boolean {
  return (order?.items || []).some((item: any) => {
    const metadata = item?.metadata || {}
    const variantMetadata = item?.variant?.metadata || {}
    const productMetadata = item?.variant?.product?.metadata || item?.product?.metadata || {}
    const productType = item?.variant?.product?.type?.value || item?.product?.type?.value || ""
    return (
      metadata.is_digital === true ||
      metadata.is_digital === "true" ||
      variantMetadata.is_digital === true ||
      variantMetadata.is_digital === "true" ||
      productMetadata.is_digital === true ||
      productMetadata.is_digital === "true" ||
      productType === "Digital Product"
    )
  })
}

function money(amount: unknown): string {
  const cents = Number(amount) || 0
  return `$${(cents / 100).toFixed(2)} CAD`
}

export default async function auditBadDigitalPrices({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  console.log("=== DIGITAL PRICE AUDIT REPORT ===")
  console.log(`Unrealistic CAD threshold: ${CAD_UNREALISTIC_AMOUNT} cents (${money(CAD_UNREALISTIC_AMOUNT)})`)
  console.log("Mode: report only, no data will be changed.")

  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "title", "handle", "metadata", "type.*", "variants.*", "variants.prices.*"],
    filters: {},
    pagination: { take: 500 },
  })

  const badProducts: any[] = []
  for (const product of products || []) {
    if (!isDigitalProduct(product)) continue

    for (const variant of product.variants || []) {
      const variantRow = variant as any
      const cadPrices = (variantRow.prices || []).filter((price: any) => {
        return String(price.currency_code || "").toLowerCase() === "cad"
      })

      for (const price of cadPrices) {
        const amount = Number(price.amount)
        if (Number.isFinite(amount) && amount > CAD_UNREALISTIC_AMOUNT) {
          badProducts.push({
            product_id: product.id,
            title: product.title,
            handle: product.handle,
            variant_id: variantRow.id,
            price_id: price.id,
            amount,
            display: money(amount),
          })
        }
      }
    }
  }

  console.log(`\nSuspicious digital product CAD prices: ${badProducts.length}`)
  if (badProducts.length) {
    console.table(badProducts)
  }

  const { data: orders } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "currency_code",
      "total",
      "subtotal",
      "payment_status",
      "created_at",
      "items.*",
      "items.metadata",
      "items.variant.*",
      "items.variant.metadata",
      "items.variant.product.*",
      "items.variant.product.metadata",
      "items.variant.product.type.*",
    ],
    filters: {},
    pagination: { take: 500, order: { created_at: "DESC" } },
  })

  const badOrders = (orders || [])
    .filter((order: any) => String(order.currency_code || "").toLowerCase() === "cad")
    .filter(isDigitalOrder)
    .filter((order: any) => Number(order.total) > CAD_UNREALISTIC_AMOUNT)
    .map((order: any) => ({
      order_id: order.id,
      display_id: order.display_id,
      email: order.email,
      payment_status: order.payment_status,
      total: Number(order.total) || 0,
      display: money(order.total),
      created_at: order.created_at,
    }))

  console.log(`\nSuspicious digital CAD orders: ${badOrders.length}`)
  if (badOrders.length) {
    console.table(badOrders)
  }

  console.log("\nAudit complete. No products or orders were modified.")
}
