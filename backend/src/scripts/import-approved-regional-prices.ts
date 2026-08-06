import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import { csvEscape, formatRowValidation, priceForCurrency } from "./lib/merchant-regional-prices.js"
import { validateMerchantRegionalPrices } from "./validate-merchant-regional-prices.js"

function applying() { return process.argv.includes("apply") && !process.argv.includes("dry-run") }
function timestamp() { return new Date().toISOString().replace(/[:.]/g, "-") }

function writeBackup(actions: any[]) {
  const backupDir = path.resolve(process.cwd(), "reports", "backups"); fs.mkdirSync(backupDir, { recursive: true })
  const stamp = timestamp(), records: any[] = []
  for (const action of actions) for (const currency of ["cad", "usd"]) {
    const price = priceForCurrency(action.variant, currency)
    records.push({ product_id: action.product.id, product_handle: action.product.handle || "", product_title: action.product.title, variant_id: action.variant.id, variant_title: action.variant.title || "", price_set_id: action.priceSetId, currency_code: currency, current_amount: price?.amount ?? "", approved_amount: currency === "cad" ? action.row.approvedCadPrice : action.row.approvedUsdPrice, operation: currency === "cad" ? action.cadAction : action.usdAction, approval_status: action.row.approvalStatus, backup_timestamp: stamp, original_price_record: price || null })
  }
  const columns = ["product_id", "product_handle", "product_title", "variant_id", "variant_title", "price_set_id", "currency_code", "current_amount", "approved_amount", "operation", "approval_status", "backup_timestamp"]
  const csvPath = path.join(backupDir, `regional-prices-before-${stamp}.csv`), jsonPath = path.join(backupDir, `regional-prices-before-${stamp}.json`)
  fs.writeFileSync(csvPath, [columns.join(","), ...records.map((record) => columns.map((key) => csvEscape(record[key])).join(","))].join("\n") + "\n", "utf8")
  fs.writeFileSync(jsonPath, JSON.stringify({ backup_timestamp: stamp, records }, null, 2), "utf8")
  return { csvPath, jsonPath }
}

export async function runApprovedRegionalPriceImport({ container }: ExecArgs, fileName = "merchant-approved-regional-prices.csv") {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER), query = container.resolve(ContainerRegistrationKeys.QUERY), pricing = container.resolve<any>("pricing"), apply = applying()
  const result = await validateMerchantRegionalPrices(query, fileName)
  const rows = result.rows.map((row) => {
    const action = result.actions.find((item) => item.row.rowNumber === row.rowNumber)
    const rowIssues = result.issuesByRowNumber.get(row.rowNumber) || []
    return { rowNumber: row.rowNumber, productId: row.productId, productTitle: action?.product.title || row.productTitle, handle: action?.product.handle || row.productHandle, variantId: row.variantId, variantTitle: action?.variant.title || row.variantTitle, currentCad: row.currentCadPrice, approvedCad: row.approvedCadPrice, currentUsd: row.currentUsdPrice, approvedUsd: row.approvedUsdPrice, approvalStatus: row.approvalStatus, cadAction: action?.cadAction || "SKIP", usdAction: action?.usdAction || "SKIP", validation: formatRowValidation(rowIssues, Boolean(action)) }
  })
  logger.info("[APPROVED_REGIONAL_PRICE_DRY_RUN_PLAN]"); logger.info(JSON.stringify({ mode: apply ? "APPLY" : "DRY_RUN", rows, summary: result.summary, validationIssues: result.issues, writesPerformed: 0 }, null, 2))
  if (!apply) return
  if (result.issues.length) throw new Error("Validation failures exist. Apply aborted before backup or writes.")
  const backup = writeBackup(result.actions)
  let cadUpdated = 0, usdCreated = 0
  for (const action of result.actions) {
    if (action.cadAction === "CAD_UPDATE") { const cad = priceForCurrency(action.variant, "cad"); await pricing.updatePrices([{ id: cad.id, amount: Number(action.row.approvedCadPrice) }]); cadUpdated++ }
    if (action.usdAction === "USD_CREATE") { await pricing.createPrices([{ price_set_id: action.priceSetId, currency_code: "usd", amount: Number(action.row.approvedUsdPrice) }]); usdCreated++ }
    const { data } = await query.graph({ entity: "product", fields: ["id", "variants.id", "variants.prices.amount", "variants.prices.currency_code"], filters: { id: action.product.id } })
    const variant = data?.[0]?.variants?.find((candidate: any) => candidate.id === action.variant.id)
    if (action.cadAction === "CAD_UPDATE" && Number(priceForCurrency(variant, "cad")?.amount) !== Number(action.row.approvedCadPrice)) throw new Error(`Post-write CAD verification failed for ${action.variant.id}`)
    if (action.usdAction === "USD_CREATE" && Number(priceForCurrency(variant, "usd")?.amount) !== Number(action.row.approvedUsdPrice)) throw new Error(`Post-write USD verification failed for ${action.variant.id}`)
  }
  logger.info("[APPROVED_REGIONAL_PRICE_IMPORT_DONE]"); logger.info(JSON.stringify({ mode: "APPLY", cadUpdated, usdCreated, backup, writesPerformed: cadUpdated + usdCreated }, null, 2))
}

export default async function importApprovedRegionalPrices(args: ExecArgs) {
  return runApprovedRegionalPriceImport(args)
}
