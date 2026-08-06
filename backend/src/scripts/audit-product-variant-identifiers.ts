import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as path from "path"
import { BARCODE_AUDIT_HEADERS, buildAuditRows, type CatalogVariant, readBarcodeAuditCsv, VARIANT_BARCODE_GRAPH_FIELDS, writeBarcodeAuditCsv } from "./lib/variant-barcodes"

export default async function auditProductVariantIdentifiers({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as { graph(input: Record<string, unknown>): Promise<{ data: CatalogVariant[] }> }
  const reportPath = path.resolve(process.cwd(), "reports", "product-variant-barcode-audit.csv")
  const previous = readBarcodeAuditCsv(reportPath)
  const { data } = await query.graph({ entity: "variant", fields: [...VARIANT_BARCODE_GRAPH_FIELDS], pagination: { take: 10000 } })
  const rows = buildAuditRows(data || [], previous)
  writeBarcodeAuditCsv(reportPath, rows)
  const barcodeCounts = new Map<string, number>()
  const skuCounts = new Map<string, number>()
  for (const row of rows) {
    if (row.existing_barcode) barcodeCounts.set(row.existing_barcode, (barcodeCounts.get(row.existing_barcode) || 0) + 1)
    if (row.sku) skuCounts.set(row.sku, (skuCounts.get(row.sku) || 0) + 1)
  }
  const marker = {
    productsAudited: new Set(rows.map((row) => row.product_id).filter(Boolean)).size,
    variantsAudited: rows.length,
    barcodePresent: rows.filter((row) => row.existing_barcode || row.existing_ean || row.existing_upc).length,
    skuOnly: rows.filter((row) => row.sku && !row.existing_barcode && !row.existing_ean && !row.existing_upc).length,
    allIdentifiersMissing: rows.filter((row) => !row.sku && !row.existing_barcode && !row.existing_ean && !row.existing_upc).length,
    duplicateBarcodes: [...barcodeCounts.values()].filter((count) => count > 1).length,
    duplicateSkus: [...skuCounts.values()].filter((count) => count > 1).length,
    notPosEligible: rows.filter((row) => row.pos_sales_channel_linked !== "true").length,
    databaseWrites: 0,
    report: reportPath,
    columns: BARCODE_AUDIT_HEADERS.length,
  }
  console.log("[PRODUCT_VARIANT_BARCODE_AUDIT]")
  console.log(JSON.stringify(marker, null, 2))
}
