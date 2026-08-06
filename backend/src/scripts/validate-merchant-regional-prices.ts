import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import { APPROVAL_STATUSES, MerchantRegionalPriceRow, PRODUCTION_SALES_CHANNEL_ID, hasUnsafeAmountSyntax, parseMajorAmount, priceForCurrency, readMerchantApprovalCsv, resolvePriceSetId, RowIssue } from "./lib/merchant-regional-prices.js"

export interface PlannedRegionalPriceAction { row: MerchantRegionalPriceRow; product: any; variant: any; priceSetId: string; cadAction: string; usdAction: string; reason: string }
export interface MerchantValidationResult { rows: MerchantRegionalPriceRow[]; issues: RowIssue[]; issuesByRowNumber: Map<number, RowIssue[]>; actions: PlannedRegionalPriceAction[]; summary: Record<string, number> }

function isLikelyTestProduct(product: any) { return /\b(test|debug|e2e)\b/i.test(`${product?.title || ""} ${product?.handle || ""}`) }

export async function validateMerchantRegionalPrices(query: any, fileName = "merchant-approved-regional-prices.csv"): Promise<MerchantValidationResult> {
  const csvPath = path.resolve(process.cwd(), "reports", fileName)
  if (!fs.existsSync(csvPath)) throw new Error(`CSV file not found: ${csvPath}. Run report-merchant-approved-regional-prices.ts first.`)
  const { rows } = readMerchantApprovalCsv(csvPath), issues: RowIssue[] = [], issuesByRowNumber = new Map<number, RowIssue[]>(), actions: PlannedRegionalPriceAction[] = []
  const summary: Record<string, number> = { totalRows: rows.length, approvedRows: 0, pendingRows: 0, reviewRows: 0, rejectedRows: 0, validCadUpdates: 0, validUsdCreates: 0, usdOverwriteAttempts: 0, staleCadRows: 0, staleUsdRows: 0, missingProducts: 0, missingVariants: 0, invalidValues: 0, conflicts: 0, writesPerformed: 0 }
  const seenPairs = new Set<string>(), seenVariants = new Map<string, MerchantRegionalPriceRow>()
  for (const row of rows) {
    const rowIssues: RowIssue[] = []
    const add = (reason: string) => rowIssues.push({ rowNumber: row.rowNumber, productId: row.productId, productHandle: row.productHandle, variantId: row.variantId, reason })
    const finish = () => { if (rowIssues.length) { issues.push(...rowIssues); issuesByRowNumber.set(row.rowNumber, rowIssues) } }
    const status = row.approvalStatus.trim().toLowerCase(), pair = `${row.productId}:${row.variantId}`
    if (!APPROVAL_STATUSES.has(status)) { add(status ? `Unsupported approval_status '${row.approvalStatus}'` : "Blank approval_status"); summary.invalidValues++; finish(); continue }
    summary[`${status}Rows`]++
    if (!row.productId || !row.variantId || seenPairs.has(pair)) { add(!row.productId || !row.variantId ? "Missing product_id or variant_id" : "Duplicate product and variant row"); summary.conflicts++; finish(); continue }
    seenPairs.add(pair)
    const previous = seenVariants.get(row.variantId)
    if (previous && (previous.approvedCadPrice !== row.approvedCadPrice || previous.approvedUsdPrice !== row.approvedUsdPrice || previous.approvalStatus !== row.approvalStatus)) { add("Duplicate variant_id with conflicting values"); summary.conflicts++; finish(); continue }
    seenVariants.set(row.variantId, row)
    const { data } = await query.graph({ entity: "product", fields: ["id", "title", "handle", "sales_channels.id", "variants.id", "variants.title", "variants.prices.id", "variants.prices.amount", "variants.prices.currency_code", "variants.prices.price_set_id"], filters: { id: row.productId } })
    const product = data?.[0] as any
    if (!product) { add("Product no longer exists"); summary.missingProducts++; finish(); continue }
    const variant = product.variants?.find((candidate: any) => candidate.id === row.variantId)
    if (!variant) { add("Variant no longer exists or is not linked to product_id"); summary.missingVariants++; finish(); continue }
    if (!(product.sales_channels || []).some((channel: any) => channel.id === PRODUCTION_SALES_CHANNEL_ID)) { add("Product is not attached to the production sales channel"); finish(); continue }
    const cad = priceForCurrency(variant, "cad"), usd = priceForCurrency(variant, "usd")
    if (String(cad?.amount ?? "") !== row.currentCadPrice) { add(`Stale CAD value: CSV '${row.currentCadPrice}', current '${cad?.amount ?? ""}'`); summary.staleCadRows++; finish(); continue }
    if (String(usd?.amount ?? "") !== row.currentUsdPrice) { add(`Stale USD value: CSV '${row.currentUsdPrice}', current '${usd?.amount ?? ""}'`); summary.staleUsdRows++; finish(); continue }
    if (status !== "approved") continue
    if (isLikelyTestProduct(product)) { add("Test/debug product requires explicit separate approval and is blocked"); finish(); continue }
    const cadText = row.approvedCadPrice.trim(), usdText = row.approvedUsdPrice.trim(), cadAmount = cadText ? parseMajorAmount(cadText) : null, usdAmount = usdText ? parseMajorAmount(usdText) : null
    if (!cadText && !usdText) { add("Approved row requires at least one approved price"); summary.invalidValues++; finish(); continue }
    if ((cadText && (hasUnsafeAmountSyntax(cadText) || cadAmount === null)) || (usdText && (hasUnsafeAmountSyntax(usdText) || usdAmount === null)) || (usdAmount === 0 && usdText)) { add("Approved price must be a finite major-unit value with at most two decimals; USD creates cannot be zero"); summary.invalidValues++; finish(); continue }
    if (cadText && !cad) { add("Approved CAD update requires an existing CAD record"); summary.invalidValues++; finish(); continue }
    if (usdText && usd && usdAmount !== Number(usd.amount)) { add(`EXISTING_USD_PRICE: ${usd.amount}; USD overwrite is not supported by this importer`); summary.usdOverwriteAttempts++; finish(); continue }
    const cadAction = cadText && cadAmount !== Number(cad?.amount) ? "CAD_UPDATE" : "SKIP"
    const usdAction = usdText && !usd ? "USD_CREATE" : "SKIP"
    let priceSetId = ""
    if (cadAction !== "SKIP" || usdAction !== "SKIP") {
      priceSetId = await resolvePriceSetId(query, variant)
      if (!priceSetId) { add("Price set is missing"); finish(); continue }
    }
    actions.push({ row, product, variant, priceSetId, cadAction, usdAction, reason: cadAction === "SKIP" && usdAction === "SKIP" ? "Approved values already match current records" : "Approved merchant values" })
    if (cadAction === "CAD_UPDATE") summary.validCadUpdates++; if (usdAction === "USD_CREATE") summary.validUsdCreates++
  }
  return { rows, issues, issuesByRowNumber, actions, summary }
}

export default async function validateMerchantRegionalPricesScript({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER), query = container.resolve(ContainerRegistrationKeys.QUERY), result = await validateMerchantRegionalPrices(query)
  logger.info("[MERCHANT_REGIONAL_PRICE_VALIDATION]")
  logger.info(JSON.stringify({ valid: result.issues.length === 0, moneyUnit: "major", ...result.summary, validationFailures: result.issues.length, validationIssues: result.issues, plannedActions: result.actions.map((action) => ({ productId: action.row.productId, productTitle: action.product.title, handle: action.product.handle, variantId: action.row.variantId, variantTitle: action.variant.title, priceSetId: action.priceSetId, currentCad: action.row.currentCadPrice, approvedCad: action.row.approvedCadPrice, currentUsd: action.row.currentUsdPrice, approvedUsd: action.row.approvedUsdPrice, approvalStatus: action.row.approvalStatus, cadAction: action.cadAction, usdAction: action.usdAction, reason: action.reason })) }, null, 2))
}
