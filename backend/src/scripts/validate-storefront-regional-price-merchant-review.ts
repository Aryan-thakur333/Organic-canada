import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as path from "path"
import { ReviewRow, isTestOrDebugProduct, parseApprovedAmount, pricesForCurrency, readReviewCsv } from "./lib/storefront-regional-price-review.js"

export type PlannedPriceAction = { row: ReviewRow; product: any; variant: any; currency: "usd" | "cad"; current: string; approved: string; action: "CREATE" | "UPDATE" | "SKIP" | "BLOCKED" | "STALE"; reason: string }

interface ReviewProduct {
  id: string
  variants?: Array<{ id: string }>
}

export async function validateStorefrontRegionalPriceMerchantReview(query: any) {
  const filePath = path.resolve(process.cwd(), "reports", "storefront-regional-price-merchant-review.csv")
  const rows = readReviewCsv(filePath), issues: string[] = [], actions: PlannedPriceAction[] = []
  const { data } = await query.graph({ entity: "product", fields: ["id", "title", "handle", "metadata", "variants.id", "variants.title", "variants.prices.id", "variants.prices.currency_code", "variants.prices.amount", "variants.prices.price_set_id"] })
  const products = new Map<string, ReviewProduct>((data || []).map((product: any) => [product.id, product]))
  const seen = new Set<string>(); let approvedRows = 0, pendingRows = 0, staleRows = 0, invalidRows = 0, skippedRows = 0
  for (const row of rows) {
    const prefix = `product=${row.product_id} variant=${row.variant_id}`
    const product = products.get(row.product_id), variant = product?.variants?.find((candidate: any) => candidate.id === row.variant_id)
    const rowIssues: string[] = []
    if (!product) rowIssues.push("product no longer exists")
    if (product && !variant) rowIssues.push("variant no longer exists or does not belong to product")
    if (String(row.approved).toLowerCase() !== "true" && String(row.approved).toLowerCase() !== "false") rowIssues.push("approved must be explicit true or false")
    if (product && isTestOrDebugProduct(product) && String(row.approved).toLowerCase() === "true") rowIssues.push("test/debug rows cannot be applied")
    if (seen.has(row.variant_id)) rowIssues.push("duplicate variant row")
    seen.add(row.variant_id)
    const isApproved = String(row.approved).toLowerCase() === "true"
    if (isApproved) approvedRows++; else pendingRows++
    for (const currency of ["usd", "cad"] as const) {
      const approvedText = row[`approved_${currency}`] || "", currentText = row[`current_${currency}`] || ""
      const approved = parseApprovedAmount(approvedText)
      if (approved.reason) rowIssues.push(`${currency} approved price ${approved.reason}`)
      if (isApproved && !row.approved_usd && !row.approved_cad) rowIssues.push("approved row must include at least one approved price")
      if (!variant) continue
      const current = pricesForCurrency(variant, currency); const currentAmount = current[0] ? String(current[0].amount) : ""
      if (currentAmount !== currentText) { rowIssues.push(`${currency} snapshot is stale (CSV=${currentText || "missing"}, database=${currentAmount || "missing"})`); staleRows++ }
      if (!isApproved || !approvedText || approved.reason) { if (!isApproved || !approvedText) skippedRows++; continue }
      const key = `${row.variant_id}:${currency}`
      if ([...actions].some((action) => `${action.row.variant_id}:${action.currency}` === key)) rowIssues.push(`duplicate approved ${currency} action`)
      actions.push({ row, product, variant, currency, current: currentAmount, approved: approvedText, action: currentAmount === approvedText ? "SKIP" : currentAmount ? "UPDATE" : "CREATE", reason: currentAmount === approvedText ? "approved value already matches current record" : "approved merchant value" })
    }
    if (rowIssues.length) { invalidRows++; issues.push(`${prefix}: ${rowIssues.join("; ")}`) }
  }
  const blocking = issues.length > 0
  const summary = { valid: !blocking, totalRows: rows.length, approvedRows, pendingRows, staleRows, invalidRows, skippedRows, plannedCreates: actions.filter((action) => action.action === "CREATE").length, plannedUpdates: actions.filter((action) => action.action === "UPDATE").length, plannedSkips: actions.filter((action) => action.action === "SKIP").length, writesPerformed: 0 }
  return { rows, actions, issues, summary }
}

export default async function validateStorefrontRegionalPriceMerchantReviewScript({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER), query = container.resolve(ContainerRegistrationKeys.QUERY)
  const result = await validateStorefrontRegionalPriceMerchantReview(query)
  logger.info("[STOREFRONT_REGIONAL_PRICE_REVIEW_VALIDATION]"); logger.info(JSON.stringify({ ...result.summary, issues: result.issues, moneyUnit: "major", writesPerformed: 0 }, null, 2))
  if (!result.summary.valid) process.exitCode = 1
}
