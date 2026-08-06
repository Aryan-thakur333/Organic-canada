import type { ExecArgs } from "@medusajs/framework/types"
import * as path from "path"
import { readBarcodeAuditCsv, validateInternalBarcode, writeBarcodeAuditCsv } from "./lib/variant-barcodes"

export default async function generateMissingInternalBarcodes(_args: ExecArgs) {
  const reportPath = path.resolve(process.cwd(), "reports", "product-variant-barcode-audit.csv")
  const rows = readBarcodeAuditCsv(reportPath)
  const suggestions = new Set<string>()
  let suggested = 0
  let invalid = 0
  for (const row of rows) {
    if (row.suggested_internal_barcode) {
      if (validateInternalBarcode(row.suggested_internal_barcode).length || suggestions.has(row.suggested_internal_barcode)) invalid++
      else { suggestions.add(row.suggested_internal_barcode); suggested++ }
    }
  }
  writeBarcodeAuditCsv(reportPath, rows)
  console.log("[MISSING_INTERNAL_BARCODES_REPORT_ONLY]")
  console.log(JSON.stringify({ rowsRead: rows.length, internalBarcodesSuggested: suggested, invalidSuggestions: invalid, approvalsPreserved: rows.filter((row) => row.approved_action || row.approved_barcode).length, databaseWrites: 0, mode: "REPORT_ONLY" }, null, 2))
}
