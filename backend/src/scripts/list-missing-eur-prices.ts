import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

type ProductRow = {
  id: string
  title: string
  status?: string
  variants?: Array<{
    id: string
    title: string
    prices?: Array<{
      currency_code?: string
      amount?: number
    }>
  }>
}

export default async function listMissingEurPrices({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const regionModuleService = container.resolve(Modules.REGION)

  const regions = await regionModuleService.listRegions({})
  const eurRegions = regions.filter(
    (region) => String(region.currency_code || "").toLowerCase() === "eur"
  )

  logger.info("[EUR_PRICE_AUDIT] Dry run only. No prices will be created or updated.")

  if (!eurRegions.length) {
    logger.warn("[EUR_PRICE_AUDIT] No Medusa region with currency_code=eur was found.")
  } else {
    logger.info(
      `[EUR_PRICE_AUDIT] EUR regions: ${eurRegions
        .map((region) => `${region.name} (${region.id})`)
        .join(", ")}`
    )
  }

  const { data } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "status",
      "variants.id",
      "variants.title",
      "variants.prices.currency_code",
      "variants.prices.amount",
    ],
  })

  const products = data as ProductRow[]
  const missing: Array<{
    product_id: string
    product_title: string
    product_status?: string
    variant_id: string
    variant_title: string
  }> = []

  for (const product of products) {
    for (const variant of product.variants || []) {
      const hasEurPrice = (variant.prices || []).some(
        (price) => String(price.currency_code || "").toLowerCase() === "eur"
      )

      if (!hasEurPrice) {
        missing.push({
          product_id: product.id,
          product_title: product.title,
          product_status: product.status,
          variant_id: variant.id,
          variant_title: variant.title,
        })
      }
    }
  }

  logger.info(
    JSON.stringify(
      {
        total_products_checked: products.length,
        missing_eur_variant_prices: missing.length,
        missing,
      },
      null,
      2
    )
  )
}
