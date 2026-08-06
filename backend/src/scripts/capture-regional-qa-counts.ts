import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

const PRODUCTION_SALES_CHANNEL_ID = "sc_01KVJF9HK0YY92JES8P7VPZN12"

function selectedPrices(variant: unknown): Array<Record<string, unknown>> {
  if (typeof variant !== "object" || variant === null) return []
  const prices = (variant as Record<string, unknown>).prices
  return Array.isArray(prices) ? prices.filter((price): price is Record<string, unknown> => typeof price === "object" && price !== null) : []
}

export default async function captureRegionalQaCounts({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: products } = await query.graph({
    entity: "product",
    fields: ["id", "sales_channels.id", "variants.id", "variants.prices.id", "variants.prices.currency_code"],
  })

  let variants = 0, prices = 0, cadPrices = 0, usdPrices = 0, productionChannelProducts = 0
  for (const product of products || []) {
    if ((product.sales_channels || []).some((channel: any) => channel.id === PRODUCTION_SALES_CHANNEL_ID)) productionChannelProducts++
    for (const variant of product.variants || []) {
      variants++
      for (const price of selectedPrices(variant)) {
        prices++
        const currency = String(price.currency_code || "").toLowerCase()
        if (currency === "cad") cadPrices++
        if (currency === "usd") usdPrices++
      }
    }
  }
  logger.info("[REGIONAL_QA_DATABASE_COUNTS]")
  logger.info(JSON.stringify({ products: (products || []).length, variants, priceRecords: prices, cadPrices, usdPrices, productionChannelProducts, writesPerformed: 0 }, null, 2))
}
