import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

const SAMPLE_VARIANT_IDS = [
  "variant_01KVJF9J7TBTE05S8FBCXNTTGD",
  "variant_01KVJF9J7VRDSRVXN2TPR5E5JS",
  "variant_01KVJF9J7WMRTV8Z6YF9PXPMTB",
]

export default async function inspectPriceMoneyUnit({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "handle",
      "variants.id",
      "variants.title",
      "variants.prices.id",
      "variants.prices.amount",
      "variants.prices.currency_code",
      "variants.prices.price_set_id",
    ],
  })

  const rows: any[] = []

  for (const product of products as any[]) {
    for (const variant of product.variants || []) {
      if (!SAMPLE_VARIANT_IDS.includes(variant.id)) continue

      rows.push({
        product_id: product.id,
        product_title: product.title,
        product_handle: product.handle,
        variant_id: variant.id,
        variant_title: variant.title,
        stored_prices: (variant.prices || [])
          .filter((price: any) => ["cad", "usd"].includes(String(price.currency_code || "").toLowerCase()))
          .map((price: any) => ({
            price_id: price.id,
            price_set_id: price.price_set_id,
            currency_code: price.currency_code,
            stored_amount: price.amount,
          })),
      })
    }
  }

  logger.info("[PRICE_MONEY_UNIT_INSPECTION]")
  logger.info(JSON.stringify({ rows }, null, 2))
}
