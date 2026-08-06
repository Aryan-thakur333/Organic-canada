import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import { ReviewRow, isTestOrDebugProduct, readReviewCsv, writeReviewCsv } from "./lib/storefront-regional-price-review.js"

const GROUPS = ["MISSING_BOTH", "MISSING_USD", "MISSING_CAD", "HIGH_VALUE_REVIEW", "VALID_BOTH"] as const
type ReviewGroup = (typeof GROUPS)[number]
type SummaryReviewGroup = ReviewGroup | "NO_ACTIVE_VARIANT"

function groupFor(row: ReviewRow): ReviewGroup {
  if (row.usd_status === "missing" && row.cad_status === "missing") return "MISSING_BOTH"
  if (row.usd_status === "missing") return "MISSING_USD"
  if (row.cad_status === "missing") return "MISSING_CAD"
  if (row.review_flags.includes("HIGH_USD_REVIEW") || row.review_flags.includes("HIGH_CAD_REVIEW")) return "HIGH_VALUE_REVIEW"
  return "VALID_BOTH"
}

function compareRows(left: ReviewRow, right: ReviewRow) {
  const groupDifference = GROUPS.indexOf(groupFor(left) as any) - GROUPS.indexOf(groupFor(right) as any)
  if (groupDifference) return groupDifference
  return ["product_type", "category", "product_title", "variant_title"].map((field) => String(left[field as keyof ReviewRow]).localeCompare(String(right[field as keyof ReviewRow]), undefined, { sensitivity: "base" })).find(Boolean) || 0
}

export default async function prepareStorefrontRegionalPriceMerchantReview({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const reportsDir = path.resolve(process.cwd(), "reports"), csvPath = path.join(reportsDir, "storefront-regional-price-merchant-review.csv")
  const rows = readReviewCsv(csvPath), seen = new Set<string>(), auditIssues: string[] = []
  for (const row of rows) {
    const key = `${row.product_id}:${row.variant_id}`
    if (!row.product_id || !row.variant_id) auditIssues.push(`missing active product/variant ID: ${key}`)
    if (seen.has(key)) auditIssues.push(`duplicate product/variant row: ${key}`)
    seen.add(key)
    if (isTestOrDebugProduct({ title: row.product_title, handle: row.product_handle })) auditIssues.push(`test/debug product included: ${key}`)
    if (row.approved !== "false" && row.approved !== "true") auditIssues.push(`invalid approved value for ${key}`)
  }
  if (auditIssues.length) throw new Error(`Merchant CSV audit failed: ${auditIssues.join("; ")}`)
  const sorted = [...rows].sort(compareRows); writeReviewCsv(csvPath, sorted)
  const visibility = (region: "usa" | "canada") => JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "..", "frontend", "reports", `storefront-product-visibility-${region}.json`), "utf8")) as Array<{ productId: string; publicVisible: boolean; regionalPriceAvailable: boolean }>
  const usa = visibility("usa"), canada = visibility("canada"), csvProductIds = new Set(rows.map((row) => row.product_id))
  const noVariant = usa.filter((row) => row.publicVisible && !csvProductIds.has(row.productId))
  const summaryRows = GROUPS.map((group) => {
    const groupRows = sorted.filter((row) => groupFor(row) === group)
    return { review_group: group as SummaryReviewGroup, product_count: new Set(groupRows.map((row) => row.product_id)).size, variant_count: groupRows.length, missing_usd_count: groupRows.filter((row) => row.usd_status === "missing").length, missing_cad_count: groupRows.filter((row) => row.cad_status === "missing").length, high_usd_count: groupRows.filter((row) => row.review_flags.includes("HIGH_USD_REVIEW")).length, high_cad_count: groupRows.filter((row) => row.review_flags.includes("HIGH_CAD_REVIEW")).length, approved_count: groupRows.filter((row) => row.approved === "true").length, pending_count: groupRows.filter((row) => row.approved === "false").length }
  })
  summaryRows.push({ review_group: "NO_ACTIVE_VARIANT", product_count: noVariant.length, variant_count: 0, missing_usd_count: noVariant.filter((row) => !row.regionalPriceAvailable).length, missing_cad_count: noVariant.filter((row) => !canada.find((candidate) => candidate.productId === row.productId)?.regionalPriceAvailable).length, high_usd_count: 0, high_cad_count: 0, approved_count: 0, pending_count: noVariant.length })
  const summaryHeaders = Object.keys(summaryRows[0]); const summaryPath = path.join(reportsDir, "storefront-regional-price-review-summary.csv")
  fs.writeFileSync(summaryPath, `${summaryHeaders.join(",")}\n${summaryRows.map((row) => summaryHeaders.map((header) => row[header as keyof typeof row]).join(",")).join("\n")}\n`, "utf8")
  logger.info("[STOREFRONT_MERCHANT_PRICE_REVIEW_PREPARED]"); logger.info(JSON.stringify({ merchantCsvPath: csvPath, summaryPath, totalRows: rows.length, sorted: true, auditIssues: 0, noActiveVariantProducts: noVariant.length, writesPerformed: 0 }, null, 2))
}
