import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import { MerchantRegionalPriceRow, PRODUCTION_SALES_CHANNEL_ID, parseMajorAmount, priceForCurrency, readMerchantApprovalCsv, writeMerchantApprovalCsv } from "./lib/merchant-regional-prices.js"

function readLegacyApprovals(csvPath: string, valueColumn: string) {
  if (!fs.existsSync(csvPath)) return new Map<string, string>()
  const lines = fs.readFileSync(csvPath, "utf8").split(/\r?\n/).filter(Boolean)
  const parse = (line: string) => { const values: string[] = []; let value = "", quoted = false; for (let index = 0; index < line.length; index++) { const char = line[index]; if (char === '"') { if (quoted && line[index + 1] === '"') { value += '"'; index++ } else quoted = !quoted } else if (char === "," && !quoted) { values.push(value.trim()); value = "" } else value += char } values.push(value.trim()); return values }
  const headers = parse(lines.shift() || "").map((item) => item.trim())
  const variantIndex = headers.indexOf("variant_id"), valueIndex = headers.indexOf(valueColumn)
  const values = new Map<string, string>()
  for (const line of lines) { const cells = parse(line), value = String(cells[valueIndex] || "").trim(); if (cells[variantIndex] && parseMajorAmount(value) !== null) values.set(cells[variantIndex].trim(), value) }
  return values
}

export default async function reportMerchantApprovedRegionalPrices({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER), query = container.resolve(ContainerRegistrationKeys.QUERY)
  const reportPath = path.resolve(process.cwd(), "reports", "merchant-approved-regional-prices.csv")
  const existing = fs.existsSync(reportPath) ? new Map(readMerchantApprovalCsv(reportPath).rows.map((row) => [row.variantId, row])) : new Map<string, MerchantRegionalPriceRow>()
  const legacyCad = readLegacyApprovals(path.resolve(process.cwd(), "reports", "suspicious-cad-prices.csv"), "approved_corrected_cad_price")
  const legacyUsd = readLegacyApprovals(path.resolve(process.cwd(), "reports", "missing-usd-prices.csv"), "suggested_usd_price")
  const conflicts: any[] = []
  const { data: products } = await query.graph({ entity: "product", fields: ["id", "title", "handle", "sales_channels.id", "variants.id", "variants.title", "variants.prices.id", "variants.prices.amount", "variants.prices.currency_code"] })
  const rows: MerchantRegionalPriceRow[] = []
  for (const product of products || []) {
    if (!(product.sales_channels || []).some((channel: any) => channel.id === PRODUCTION_SALES_CHANNEL_ID)) continue
    for (const variant of product.variants || []) {
      const originalPrevious = existing.get(variant.id)
      // A pending nonnumeric value cannot be a merchant approval. This only repairs the
      // malformed cells produced by the earlier report reader; approved/manual values win.
      const previous = originalPrevious?.approvalStatus === "pending" && !originalPrevious.merchantNote && ((originalPrevious.approvedCadPrice && parseMajorAmount(originalPrevious.approvedCadPrice) === null) || (originalPrevious.approvedUsdPrice && parseMajorAmount(originalPrevious.approvedUsdPrice) === null))
        ? { ...originalPrevious, approvedCadPrice: "", approvedUsdPrice: "" }
        : originalPrevious
      const legacyCadValue = legacyCad.get(variant.id) || "", legacyUsdValue = legacyUsd.get(variant.id) || ""
      if (previous?.approvedCadPrice && legacyCadValue && previous.approvedCadPrice !== legacyCadValue) conflicts.push({ variantId: variant.id, currency: "cad", existing: previous.approvedCadPrice, legacy: legacyCadValue })
      if (previous?.approvedUsdPrice && legacyUsdValue && previous.approvedUsdPrice !== legacyUsdValue) conflicts.push({ variantId: variant.id, currency: "usd", existing: previous.approvedUsdPrice, legacy: legacyUsdValue })
      rows.push({
        rowNumber: 0, productId: product.id, productHandle: product.handle || "", productTitle: product.title, variantId: variant.id, variantTitle: variant.title || "",
        currentCadPrice: String(priceForCurrency(variant, "cad")?.amount ?? ""), approvedCadPrice: previous?.approvedCadPrice || legacyCadValue,
        currentUsdPrice: String(priceForCurrency(variant, "usd")?.amount ?? ""), approvedUsdPrice: previous?.approvedUsdPrice || legacyUsdValue,
        approvalStatus: previous?.approvalStatus || "pending", merchantNote: previous?.merchantNote || "",
      })
    }
  }
  rows.sort((a, b) => a.productTitle.localeCompare(b.productTitle) || a.variantTitle.localeCompare(b.variantTitle))
  writeMerchantApprovalCsv(reportPath, rows)
  logger.info("[MERCHANT_REGIONAL_PRICE_APPROVAL_REPORT]")
  logger.info(JSON.stringify({ reportPath, totalRows: rows.length, existingManualRowsPreserved: [...existing.values()].filter((row) => row.approvedCadPrice || row.approvedUsdPrice || row.approvalStatus !== "pending" || row.merchantNote).length, importedLegacyCadApprovals: legacyCad.size, importedLegacyUsdApprovals: legacyUsd.size, conflicts }, null, 2))
}
