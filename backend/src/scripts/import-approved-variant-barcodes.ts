import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductVariantsWorkflow } from "@medusajs/core-flows"
import * as path from "path"
import * as fs from "fs"
import { POS_MODULE } from "../modules/pos"
import type PosModuleService from "../modules/pos/service"
import { planVariantBarcodeImport } from "./lib/variant-barcode-import"
import { readBarcodeAuditCsv, type BarcodeAuditRow, type CatalogVariant, VARIANT_BARCODE_GRAPH_FIELDS } from "./lib/variant-barcodes"
import { readPilotApprovalCsv } from "./lib/pos-barcode-pilot"

function argumentValue(name: string): string {
  const exact = process.argv.find((argument) => argument.startsWith(`--${name}=`))
  return exact ? exact.slice(name.length + 3).trim() : ""
}

export default async function importApprovedVariantBarcodes({ container }: ExecArgs) {
  const apply = process.argv.includes("--apply")
  const requestedFile = argumentValue("file")
  const filePath = path.resolve(process.cwd(), requestedFile || "reports/product-variant-barcode-audit.csv")
  const firstLine = fs.readFileSync(filePath, "utf8").split(/\r?\n/, 1)[0]?.toLowerCase() || ""
  const pilotFile = firstLine.includes("approval_status") && firstLine.includes("canada_price_available")
  const rows: BarcodeAuditRow[] = pilotFile
    ? readPilotApprovalCsv(filePath).map((row) => ({
      product_id: row.product_id, product_title: row.product_title, product_status: "published", product_type: "",
      variant_id: row.variant_id, variant_title: row.variant_title, sku: row.sku, existing_barcode: row.existing_barcode,
      existing_ean: "", existing_upc: "", inventory_item_id: "", pos_sales_channel_linked: row.pos_sales_channel_linked,
      classification: "PILOT_APPROVED", suggested_internal_barcode: row.suggested_internal_barcode,
      approved_action: row.approved_action, approved_barcode: row.approved_barcode, notes: row.notes,
    }))
    : readBarcodeAuditCsv(filePath)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as { graph(input: Record<string, unknown>): Promise<{ data: CatalogVariant[] }> }
  const { data } = await query.graph({ entity: "variant", fields: [...VARIANT_BARCODE_GRAPH_FIELDS], pagination: { take: 10000 } })
  const plan = planVariantBarcodeImport(rows, data || [])
  const dryRun = {
    rowsRead: rows.length,
    approvedRows: plan.approvedRows,
    plannedUpdates: plan.planned.length,
    unchangedRows: plan.unchangedRows,
    duplicateValues: plan.duplicateValues,
    invalidRows: plan.invalidRows,
    staleRows: plan.staleRows,
    missingVariants: plan.missingVariants,
    ineligibleRows: plan.ineligibleRows,
    databaseWrites: 0,
    passed: plan.duplicateValues === 0 && plan.invalidRows === 0 && plan.staleRows === 0 && plan.missingVariants === 0 && plan.ineligibleRows === 0 && plan.approvedRows === plan.planned.length + plan.unchangedRows,
    planned: plan.planned,
    errors: plan.errors,
  }
  if (!apply) {
    console.log(pilotFile ? "[POS_BARCODE_PILOT_IMPORT_DRY_RUN]" : "[VARIANT_BARCODE_IMPORT_DRY_RUN]")
    console.log(JSON.stringify(dryRun, null, 2))
    return
  }

  if (plan.duplicateValues || plan.invalidRows || plan.staleRows || plan.missingVariants || plan.ineligibleRows) {
    throw new Error(`Barcode apply blocked: ${JSON.stringify({ duplicateValues: plan.duplicateValues, invalidRows: plan.invalidRows, staleRows: plan.staleRows, missingVariants: plan.missingVariants, ineligibleRows: plan.ineligibleRows })}`)
  }
  const backupReference = argumentValue("backup-reference")
  if (plan.planned.length && !backupReference) throw new Error("Barcode apply requires --backup-reference=<fresh-database-backup-reference>")

  let updatedVariants = 0
  let auditRecords = 0
  if (plan.planned.length) {
    await updateProductVariantsWorkflow(container).run({ input: { product_variants: plan.planned.map((entry) => ({ id: entry.variantId, barcode: entry.barcode })) } })
    updatedVariants = plan.planned.length
    const posService = container.resolve(POS_MODULE) as PosModuleService
    for (const entry of plan.planned) {
      await posService.createPosAuditEvents({ event_type: "VARIANT_INTERNAL_BARCODE_ASSIGNED", message: "Approved internal Code 128 barcode assigned", metadata: { product_id: entry.productId, variant_id: entry.variantId, barcode: entry.barcode, approval_file: path.basename(filePath), backup_reference: backupReference } })
      auditRecords++
    }
  }
  console.log(pilotFile ? "[POS_BARCODE_PILOT_IMPORT_APPLY]" : "[VARIANT_BARCODE_IMPORT_APPLY]")
  console.log(JSON.stringify({ approvedRows: plan.approvedRows, updatedVariants, alreadyApplied: plan.unchangedRows, failedRows: 0, databaseWrites: updatedVariants + auditRecords, auditRecords, passed: true }, null, 2))
}
