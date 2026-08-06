import * as fs from "fs"
import * as path from "path"

export const PRODUCTION_SALES_CHANNEL_ID = "sc_01KVJF9HK0YY92JES8P7VPZN12"
export const SUPPORTED_APPROVED_ACTIONS = new Set([
  "keep",
  "remove_from_sales_channel",
  "merge_manually",
  "review",
])

export interface CatalogCleanupRow {
  product_id: string
  title: string
  handle: string
  status: string
  sales_channel_membership: string
  variant_ids: string
  cad_price: string
  usd_price: string
  created_at: string
  updated_at: string
  likely_test_product: string
  duplicate_group: string
  recommended_action: string
  approved_action: string
}

export interface CatalogValidation {
  rows: CatalogCleanupRow[]
  productsById: Map<string, any>
  issues: Array<{ productId: string; reason: string }>
  duplicateProductIds: string[]
  staleSalesChannelMemberships: string[]
  missingProducts: string[]
  actionCounts: Record<string, number>
  alreadyUnlinked: string[]
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let entry = ""
  let quoted = false
  for (let index = 0; index < line.length; index++) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        entry += '"'
        index++
      } else quoted = !quoted
    } else if (character === "," && !quoted) {
      result.push(entry.trim())
      entry = ""
    } else entry += character
  }
  result.push(entry.trim())
  return result
}

export function readCatalogCleanupCsv(): CatalogCleanupRow[] {
  const csvPath = path.resolve(process.cwd(), "reports", "product-catalog-cleanup-audit.csv")
  if (!fs.existsSync(csvPath)) throw new Error(`CSV file not found: ${csvPath}`)
  const lines = fs.readFileSync(csvPath, "utf8").split(/\r?\n/).filter((line) => line.trim())
  if (lines.length <= 1) return []
  const headers = parseCsvLine(lines[0]).map((item) => item.replace(/^\uFEFF/, "").trim().toLowerCase())
  return lines.slice(1).map((line): CatalogCleanupRow => {
    const record = Object.fromEntries(
    headers.map((header, index) => [header, String(parseCsvLine(line)[index] ?? "").trim()])
    )
    return {
      product_id: record.product_id ?? "",
      title: record.title ?? "",
      handle: record.handle ?? "",
      status: record.status ?? "",
      sales_channel_membership: record.sales_channel_membership ?? "",
      variant_ids: record.variant_ids ?? "",
      cad_price: record.cad_price ?? "",
      usd_price: record.usd_price ?? "",
      created_at: record.created_at ?? "",
      updated_at: record.updated_at ?? "",
      likely_test_product: record.likely_test_product ?? "",
      duplicate_group: record.duplicate_group ?? "",
      recommended_action: record.recommended_action ?? "",
      approved_action: record.approved_action ?? "",
    }
  })
}

export function normalizeApprovedAction(value: string): string {
  const normalized = String(value || "").trim().toLowerCase()
  if (normalized === "remove from sales channel") return "remove_from_sales_channel"
  if (normalized === "merge manually") return "merge_manually"
  return normalized
}

export function splitSalesChannels(value: string): string[] {
  return String(value || "").split("|").map((item) => item.trim()).filter(Boolean).sort()
}

export function salesChannelIds(product: any): string[] {
  return (product?.sales_channels || []).map((channel: any) => String(channel.id || "")).filter(Boolean).sort()
}

export async function validateCatalogCleanupRows(query: any): Promise<CatalogValidation> {
  const rows = readCatalogCleanupCsv()
  const issues: CatalogValidation["issues"] = []
  const productsById = new Map<string, any>()
  const duplicateProductIds: string[] = []
  const staleSalesChannelMemberships: string[] = []
  const missingProducts: string[] = []
  const alreadyUnlinked: string[] = []
  const seen = new Set<string>()
  const actionCounts: Record<string, number> = { blank: 0, keep: 0, remove_from_sales_channel: 0, merge_manually: 0, review: 0, invalid: 0 }

  for (const row of rows) {
    const productId = String(row.product_id || "").trim()
    if (!productId) {
      issues.push({ productId, reason: "Missing product_id" })
      continue
    }
    if (seen.has(productId)) {
      duplicateProductIds.push(productId)
      issues.push({ productId, reason: "Duplicate product_id in CSV" })
      continue
    }
    seen.add(productId)
    const action = normalizeApprovedAction(row.approved_action)
    if (!action) actionCounts.blank++
    else if (SUPPORTED_APPROVED_ACTIONS.has(action)) actionCounts[action]++
    else {
      actionCounts.invalid++
      issues.push({ productId, reason: `Invalid approved_action '${row.approved_action}'` })
    }

    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "title", "handle", "status", "metadata", "sales_channels.id", "sales_channels.name"],
      filters: { id: productId },
    })
    const product = data?.[0]
    if (!product) {
      missingProducts.push(productId)
      issues.push({ productId, reason: "Product no longer exists" })
      continue
    }
    productsById.set(productId, product)
    if (String(product.title || "") !== String(row.title || "")) issues.push({ productId, reason: "Product title no longer matches CSV" })
    if (String(product.handle || "") !== String(row.handle || "")) issues.push({ productId, reason: "Product handle no longer matches CSV" })
    const expected = splitSalesChannels(row.sales_channel_membership)
    const current = salesChannelIds(product)
    if (expected.join("|") !== current.join("|")) {
      staleSalesChannelMemberships.push(productId)
      issues.push({ productId, reason: `Sales-channel membership changed: CSV '${expected.join("|")}', current '${current.join("|")}'` })
    }
    if (action === "remove_from_sales_channel" && !current.includes(PRODUCTION_SALES_CHANNEL_ID)) alreadyUnlinked.push(productId)
  }
  return { rows, productsById, issues, duplicateProductIds, staleSalesChannelMemberships, missingProducts, actionCounts, alreadyUnlinked }
}

export function csvEscape(value: unknown): string {
  const text = String(value ?? "")
  const escaped = text.replace(/"/g, '""')
  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped
}
