import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as path from "path"
import { regenerateMerchantRegionalPricesCsv } from "./lib/regenerate-merchant-regional-prices-csv.js"

export default async function regenerateMerchantRegionalPricesCsvScript({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const result = regenerateMerchantRegionalPricesCsv(path.resolve(process.cwd(), "reports", "merchant-approved-regional-prices.csv"))
  logger.info("[MERCHANT_REGIONAL_PRICE_CSV_REGENERATED]")
  logger.info(JSON.stringify({ ...result, finalDelimiter: "comma", finalEncoding: "UTF-8", databaseWrites: 0 }, null, 2))
}
