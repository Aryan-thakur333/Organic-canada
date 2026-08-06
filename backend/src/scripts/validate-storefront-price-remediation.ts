import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { validateMerchantRegionalPrices } from "./validate-merchant-regional-prices.js"

export default async function validateStorefrontPriceRemediation({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const result = await validateMerchantRegionalPrices(query, "merchant-storefront-price-remediation.csv")
  logger.info("[STOREFRONT_PRICE_REMEDIATION_VALIDATION]")
  logger.info(JSON.stringify({ valid: result.issues.length === 0, moneyUnit: "major", ...result.summary, validationFailures: result.issues.length, writesPerformed: 0 }, null, 2))
}
