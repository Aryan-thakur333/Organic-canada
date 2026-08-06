import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// Deliberately planning-only. A rollback requires a separately reviewed batch-specific procedure.
export default async function rollbackStorefrontRegionalPriceBatch({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const batchId = process.argv.find((arg) => arg.startsWith("batch="))?.slice("batch=".length) || ""
  if (!batchId) throw new Error("Rollback plan requires batch=<exact-batch-id>. No writes performed.")
  if (process.argv.includes("apply")) throw new Error("Rollback execution is intentionally disabled in this safety script. No writes performed.")
  logger.info("[STOREFRONT_REGIONAL_PRICE_ROLLBACK_PLAN]"); logger.info(JSON.stringify({ batchId, mode: "DRY_RUN", writesPerformed: 0, note: "Locate and review the exact backup before any rollback implementation is authorized." }, null, 2))
}
