import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { validateRealGroceryPriceRemediation } from "./validate-real-grocery-price-remediation.js"

export default async function importApprovedRealGroceryPrices({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const apply = process.argv.includes("apply") && !process.argv.includes("dry-run")
  const result = await validateRealGroceryPriceRemediation(container.resolve(ContainerRegistrationKeys.QUERY))
  logger.info("[APPROVED_REAL_GROCERY_PRICE_DRY_RUN]")
  logger.info(JSON.stringify({ mode: apply ? "APPLY_BLOCKED" : "DRY_RUN", plannedActions: result.actions, validationFailures: result.issues, ...result.summary, writesPerformed: 0 }, null, 2))
  if (apply) throw new Error("Apply is intentionally blocked in this review-only workflow. Review the dry-run and implement explicit merchant-approved writes in a separately authorized operation.")
}
