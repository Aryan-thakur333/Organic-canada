import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import * as path from "path"
import * as fs from "fs"
import { POS_MODULE } from "../modules/pos"
import type PosModuleService from "../modules/pos/service"
import { buildPilotApprovalRows, classifyPilotProducts, POS_BARCODE_PILOT_TITLES, writePilotApprovalCsv, type PilotProduct, type PilotRegister } from "./lib/pos-barcode-pilot"
import { readBarcodeAuditCsv } from "./lib/variant-barcodes"

export default async function preparePosBarcodePilotApprovals({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as { graph(input: Record<string, unknown>): Promise<{ data: unknown[] }> }
  const channelService = container.resolve(Modules.SALES_CHANNEL) as any
  const posService = container.resolve(POS_MODULE) as PosModuleService
  const [channels, registers, graph] = await Promise.all([
    channelService.listSalesChannels({}, { take: 100 }), posService.listPosRegisters({}, { take: 100 }),
    query.graph({ entity: "product", fields: ["id", "title", "handle", "status", "deleted_at", "metadata", "type.value", "collection.id", "collection.title", "sales_channels.id", "sales_channels.name", "vendor.id", "vendor.name", "variants.id", "variants.title", "variants.sku", "variants.barcode", "variants.upc", "variants.ean", "variants.deleted_at", "variants.manage_inventory", "variants.allow_backorder", "variants.metadata", "variants.prices.amount", "variants.prices.currency_code", "variants.inventory_items.inventory_item_id", "variants.inventory_items.inventory.location_levels.location_id", "variants.inventory_items.inventory.location_levels.stocked_quantity", "variants.inventory_items.inventory.location_levels.reserved_quantity"], pagination: { take: 10000 } }),
  ])
  const posChannels = channels.filter((channel: any) => channel.name?.trim().toUpperCase() === "POS" && !channel.is_disabled)
  if (posChannels.length !== 1) throw new Error(`Expected exactly one active POS sales channel; found ${posChannels.length}`)
  const decisions = classifyPilotProducts(graph.data as PilotProduct[], posChannels[0].id, registers as PilotRegister[])
  const unsafe = decisions.filter((decision) => !decision.resolved || !["ELIGIBLE", "ALREADY_LINKED"].includes(decision.classification))
  if (unsafe.length) throw new Error(`Pilot approval preparation blocked: ${unsafe.map((entry) => `${entry.title}:${entry.classification}`).join(", ")}`)
  const notLinked = decisions.filter((decision) => !decision.alreadyLinked)
  if (notLinked.length) throw new Error(`Pilot approval preparation requires completed POS links: ${notLinked.map((entry) => entry.title).join(", ")}`)
  const rows = buildPilotApprovalRows(decisions)
  const filePath = path.resolve(process.cwd(), "reports", "pilot-pos-barcode-approvals.csv")
  writePilotApprovalCsv(filePath, rows)
  const auditPath = path.resolve(process.cwd(), "reports", "product-variant-barcode-audit.csv")
  const beforePath = path.resolve(process.cwd(), "reports", "pilot-pos-barcode-audit-before.json")
  const afterRows = readBarcodeAuditCsv(auditPath).filter((row) => (POS_BARCODE_PILOT_TITLES as readonly string[]).includes(row.product_title))
  const beforeRows = fs.existsSync(beforePath) ? (JSON.parse(fs.readFileSync(beforePath, "utf8")).rows || []) : []
  const beforeByVariant = new Map(beforeRows.map((row: any) => [row.variant_id, row]))
  const approvalsPreserved = afterRows.every((row) => {
    const before: any = beforeByVariant.get(row.variant_id)
    return !before || (row.approved_action === before.approved_action && row.approved_barcode === before.approved_barcode && row.notes === before.notes)
  })
  const suggestionsStable = afterRows.every((row) => {
    const before: any = beforeByVariant.get(row.variant_id)
    return !before?.suggested_internal_barcode || row.suggested_internal_barcode === before.suggested_internal_barcode
  })
  const suggestions = afterRows.map((row) => row.suggested_internal_barcode).filter(Boolean)
  const duplicateSuggestions = suggestions.filter((value, index) => suggestions.indexOf(value) !== index)
  const comparisonPath = path.resolve(process.cwd(), "reports", "pilot-pos-barcode-audit-comparison.json")
  fs.writeFileSync(comparisonPath, JSON.stringify({ capturedAt: new Date().toISOString(), before: beforeRows, after: afterRows }, null, 2) + "\n", "utf8")
  console.log("[POS_BARCODE_AUDIT_REFRESH]")
  console.log(JSON.stringify({ pilotRowsFound: afterRows.length, pilotRowsPosEligible: afterRows.filter((row) => row.pos_sales_channel_linked === "true").length, approvalsPreserved, suggestionsStable, duplicateSuggestions: new Set(duplicateSuggestions).size, databaseWrites: 0, comparison: comparisonPath }, null, 2))
  const duplicates = rows.map((row) => row.approved_barcode).filter(Boolean).filter((value, index, all) => all.indexOf(value) !== index)
  console.log("[POS_BARCODE_PILOT_APPROVALS]")
  console.log(JSON.stringify({ productsRequested: POS_BARCODE_PILOT_TITLES.length, pilotRows: rows.length, approvedRows: rows.filter((row) => row.approved_action === "ASSIGN_INTERNAL_BARCODE").length, existingIdentifiers: rows.filter((row) => row.approval_status === "EXISTING_IDENTIFIER").length, duplicateSuggestions: new Set(duplicates).size, databaseWrites: 0, report: filePath }, null, 2))
}
