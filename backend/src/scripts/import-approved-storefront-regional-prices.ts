import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import { csvEscape } from "./lib/storefront-regional-price-review.js"
import { validateStorefrontRegionalPriceMerchantReview } from "./validate-storefront-regional-price-merchant-review.js"

const isApply = () => process.argv.includes("apply") && !process.argv.includes("dry-run")
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-")

export default async function importApprovedStorefrontRegionalPrices({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER), query = container.resolve(ContainerRegistrationKeys.QUERY), apply = isApply()
  const result = await validateStorefrontRegionalPriceMerchantReview(query)
  logger.info("[STOREFRONT_REGIONAL_PRICE_REVIEW_IMPORT_PLAN]"); logger.info(JSON.stringify({ mode: apply ? "APPLY" : "DRY_RUN", actions: result.actions.map((action) => ({ product: action.product.title, variant: action.variant.title, currency: action.currency, currentPrice: action.current || "MISSING", approvedPrice: action.approved, action: action.action, reason: action.reason })), ...result.summary, issues: result.issues, writesPerformed: 0 }, null, 2))
  if (!apply) return
  if (process.env.ALLOW_STOREFRONT_PRICE_APPLY !== "true") throw new Error("Apply blocked: ALLOW_STOREFRONT_PRICE_APPLY=true is required. No writes performed.")
  if (!result.summary.valid || result.summary.staleRows || result.summary.invalidRows) throw new Error("Apply blocked: CSV validation is not clean. No writes performed.")
  const pricing = container.resolve<any>("pricing"), batchId = `storefront-regional-price-${stamp()}`, backupDir = path.resolve(process.cwd(), "reports", "backups")
  fs.mkdirSync(backupDir, { recursive: true })
  const backupPath = path.join(backupDir, `${batchId}.csv`)
  const backupRows = result.actions.filter((action) => action.action !== "SKIP").map((action) => [action.product.id, action.variant.id, action.currency, action.current, action.approved, batchId, new Date().toISOString()])
  fs.writeFileSync(backupPath, [["product_id", "variant_id", "currency_code", "old_amount", "new_amount", "batch_id", "timestamp"].join(","), ...backupRows.map((row) => row.map(csvEscape).join(","))].join("\n") + "\n", "utf8")
  let created = 0, updated = 0
  for (const action of result.actions.filter((item) => item.action !== "SKIP")) {
    if (action.action === "UPDATE") { const record = action.variant.prices.find((price: any) => String(price.currency_code).toLowerCase() === action.currency); await pricing.updatePrices([{ id: record.id, amount: Number(action.approved) }]); updated++ }
    if (action.action === "CREATE") { const priceSetId = action.variant.prices?.[0]?.price_set_id; if (!priceSetId) throw new Error(`Apply blocked: no price set for ${action.variant.id}`); await pricing.createPrices([{ price_set_id: priceSetId, currency_code: action.currency, amount: Number(action.approved) }]); created++ }
  }
  logger.info("[STOREFRONT_REGIONAL_PRICE_REVIEW_IMPORT_DONE]"); logger.info(JSON.stringify({ batchId, backupPath, created, updated, writesPerformed: created + updated }, null, 2))
}
