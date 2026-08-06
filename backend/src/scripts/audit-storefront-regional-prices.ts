import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import { APPROVAL_HEADERS, csvEscape, MerchantRegionalPriceRow, priceForCurrency, readMerchantApprovalCsv, writeMerchantApprovalCsv } from "./lib/merchant-regional-prices.js"

const PRODUCTION_SALES_CHANNEL_ID = "sc_01KVJF9HK0YY92JES8P7VPZN12"
const AUDIT_HEADERS = ["product_id", "product_handle", "product_title", "variant_id", "variant_title", "cad_price", "usd_price", "cad_status", "usd_status", "cad_suspicion", "usd_suspicion", "merchant_approved_cad_price", "merchant_approved_usd_price", "approval_status", "merchant_note"]

function selectedPrices(variant: unknown): Array<Record<string, unknown>> {
  if (typeof variant !== "object" || variant === null) return []
  const prices = (variant as Record<string, unknown>).prices
  return Array.isArray(prices) ? prices.filter((price): price is Record<string, unknown> => typeof price === "object" && price !== null) : []
}

function suspicion(prices: any[], currency: string) {
  const matching = prices.filter((price) => String(price.currency_code || "").toLowerCase() === currency)
  if (!matching.length) return "missing"
  const amounts = matching.map((price) => Number(price.amount))
  if (amounts.some((amount) => !Number.isFinite(amount))) return "currency_mismatch"
  if (amounts.some((amount) => amount <= 0)) return "zero_or_negative"
  if (new Set(amounts).size > 1) return "multiple_conflicting_prices"
  if (matching.length > 1) return "duplicate_price"
  const amount = amounts[0]
  if (amount > 1000) return "unusually_large"
  if (Number.isInteger(amount) && amount >= 100 && amount % 100 === 0) return "possibly_minor_unit_legacy"
  return "none"
}

function readExistingApprovals(csvPath: string) {
  return fs.existsSync(csvPath) ? new Map(readMerchantApprovalCsv(csvPath).rows.map((row) => [row.variantId, row])) : new Map<string, MerchantRegionalPriceRow>()
}

function auditMarkdown(summary: Record<string, number>, examples: any[]) {
  return [
    "# Storefront Regional Price Audit",
    "",
    "Product prices are stored and returned in major currency units. This audit reports stored catalog data as-is; it does not infer `/100` corrections.",
    "",
    ...Object.entries(summary).map(([key, value]) => `- ${key}: ${value}`),
    "- database writes: 0",
    "",
    "## Examples requiring merchant review",
    "",
    "| Product | Variant | CAD | USD | CAD finding | USD finding |",
    "| --- | --- | ---: | ---: | --- | --- |",
    ...examples.slice(0, 20).map((row) => `| ${row.product_title} | ${row.variant_title} | ${row.cad_price || "missing"} | ${row.usd_price || "missing"} | ${row.cad_suspicion} | ${row.usd_suspicion} |`),
    "",
  ].join("\n")
}

export default async function auditStorefrontRegionalPrices({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const reports = path.resolve(process.cwd(), "reports")
  const approvalPath = path.join(reports, "merchant-approved-regional-prices.csv")
  const remediationPath = path.join(reports, "merchant-storefront-price-remediation.csv")
  const existingApprovals = readExistingApprovals(fs.existsSync(remediationPath) ? remediationPath : approvalPath)
  const { data } = await query.graph({ entity: "product", fields: ["id", "title", "handle", "status", "sales_channels.id", "variants.id", "variants.title", "variants.prices.id", "variants.prices.amount", "variants.prices.currency_code"] })
  const rows: Record<string, string>[] = []
  const remediationRows: MerchantRegionalPriceRow[] = []
  for (const product of data || []) {
    if (product.status !== "published" || !(product.sales_channels || []).some((channel: any) => channel.id === PRODUCTION_SALES_CHANNEL_ID)) continue
    for (const variant of product.variants || []) {
      const existing = existingApprovals.get(variant.id)
      const cad = priceForCurrency(variant, "cad")
      const usd = priceForCurrency(variant, "usd")
      const row = {
        product_id: product.id, product_handle: product.handle || "", product_title: product.title || "", variant_id: variant.id, variant_title: variant.title || "",
        cad_price: cad ? String(cad.amount) : "", usd_price: usd ? String(usd.amount) : "", cad_status: cad ? "present" : "missing", usd_status: usd ? "present" : "missing",
        cad_suspicion: suspicion(selectedPrices(variant), "cad"), usd_suspicion: suspicion(selectedPrices(variant), "usd"),
        merchant_approved_cad_price: existing?.approvedCadPrice || "", merchant_approved_usd_price: existing?.approvedUsdPrice || "", approval_status: existing?.approvalStatus || "pending", merchant_note: existing?.merchantNote || "",
      }
      rows.push(row)
      remediationRows.push({ rowNumber: remediationRows.length + 2, productId: row.product_id, productHandle: row.product_handle, productTitle: row.product_title, variantId: row.variant_id, variantTitle: row.variant_title, currentCadPrice: row.cad_price, approvedCadPrice: row.merchant_approved_cad_price, currentUsdPrice: row.usd_price, approvedUsdPrice: row.merchant_approved_usd_price, approvalStatus: row.approval_status, merchantNote: row.merchant_note })
    }
  }
  fs.mkdirSync(reports, { recursive: true })
  fs.writeFileSync(path.join(reports, "storefront-regional-price-audit.csv"), [AUDIT_HEADERS.join(","), ...rows.map((row) => AUDIT_HEADERS.map((header) => csvEscape(row[header])).join(","))].join("\n") + "\n", "utf8")
  writeMerchantApprovalCsv(remediationPath, remediationRows)
  const summary = {
    totalProducts: new Set(rows.map((row) => row.product_id)).size, totalVariants: rows.length,
    cadPresent: rows.filter((row) => row.cad_status === "present").length, cadMissing: rows.filter((row) => row.cad_status === "missing").length,
    usdPresent: rows.filter((row) => row.usd_status === "present").length, usdMissing: rows.filter((row) => row.usd_status === "missing").length,
    suspiciousCad: rows.filter((row) => row.cad_suspicion !== "none").length, suspiciousUsd: rows.filter((row) => row.usd_suspicion !== "none").length,
    duplicateOrConflicting: rows.filter((row) => /duplicate|conflicting/.test(row.cad_suspicion) || /duplicate|conflicting/.test(row.usd_suspicion)).length,
  }
  fs.writeFileSync(path.resolve(process.cwd(), "..", "STOREFRONT_REGIONAL_PRICE_AUDIT.md"), auditMarkdown(summary, rows.filter((row) => row.cad_suspicion !== "none" || row.usd_suspicion !== "none")), "utf8")
  logger.info("[STOREFRONT_REGIONAL_PRICE_AUDIT]")
  logger.info(JSON.stringify({ moneyUnit: "major", ...summary, reportPath: path.join(reports, "storefront-regional-price-audit.csv"), remediationPath, databaseWrites: 0 }, null, 2))
}
