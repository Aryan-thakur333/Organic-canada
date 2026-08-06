import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import { readPilotApprovalCsv } from "./lib/pos-barcode-pilot"
import { normalizeIdentifier, readBarcodeAuditCsv, type CatalogVariant, VARIANT_BARCODE_GRAPH_FIELDS } from "./lib/variant-barcodes"

export default async function verifyPosBarcodePilot({ container }: ExecArgs) {
  const approvalPath = path.resolve(process.cwd(), "reports", "pilot-pos-barcode-approvals.csv")
  const beforePath = path.resolve(process.cwd(), "reports", "product-variant-barcode-audit-before-pilot.csv")
  if (!fs.existsSync(approvalPath) || !fs.existsSync(beforePath)) throw new Error("Pilot approvals and the pre-pilot full audit snapshot are required")
  const approvals = readPilotApprovalCsv(approvalPath).filter((row) => row.approved_action === "ASSIGN_INTERNAL_BARCODE")
  const before = readBarcodeAuditCsv(beforePath)
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as { graph(input: Record<string, unknown>): Promise<{ data: CatalogVariant[] }> }
  const { data } = await query.graph({ entity: "variant", fields: [...VARIANT_BARCODE_GRAPH_FIELDS], pagination: { take: 10000 } })
  const current = new Map((data || []).map((variant) => [variant.id, variant]))
  const pilotIds = new Set(approvals.map((row) => row.variant_id))
  const pilotBarcodesPresent = approvals.filter((row) => normalizeIdentifier(current.get(row.variant_id)?.barcode) === row.approved_barcode).length
  const identifiers = new Map<string, number>()
  for (const variant of data || []) for (const value of [variant.barcode, variant.upc, variant.ean].map(normalizeIdentifier).filter(Boolean)) identifiers.set(value, (identifiers.get(value) || 0) + 1)
  let nonPilotVariantsModified = 0
  let existingIdentifiersChanged = 0
  for (const row of before) {
    const variant = current.get(row.variant_id)
    if (!variant) { if (!pilotIds.has(row.variant_id)) nonPilotVariantsModified++; continue }
    const changed = normalizeIdentifier(variant.barcode) !== row.existing_barcode || normalizeIdentifier(variant.sku) !== row.sku || normalizeIdentifier(variant.upc) !== row.existing_upc || normalizeIdentifier(variant.ean) !== row.existing_ean
    if (changed && !pilotIds.has(row.variant_id)) nonPilotVariantsModified++
    if ((row.existing_barcode || row.existing_upc || row.existing_ean) && changed) existingIdentifiersChanged++
  }
  const marker = { pilotBarcodesPresent, pilotBarcodesMissing: approvals.length - pilotBarcodesPresent, duplicateBarcodes: [...identifiers.values()].filter((count) => count > 1).length, nonPilotVariantsModified, existingIdentifiersChanged, passed: pilotBarcodesPresent === approvals.length && [...identifiers.values()].every((count) => count === 1) && nonPilotVariantsModified === 0 && existingIdentifiersChanged === 0 }
  console.log("[POS_BARCODE_POST_APPLY_AUDIT]")
  console.log(JSON.stringify(marker, null, 2))
  if (!marker.passed) throw new Error(`POS barcode post-apply audit failed: ${JSON.stringify(marker)}`)
}
