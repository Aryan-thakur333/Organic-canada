import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import { POS_MODULE } from "../modules/pos"
import type PosModuleService from "../modules/pos/service"
import { readApprovedCsv } from "./lib/approved-pos-csv"
import { POS_PILOT_CAD_TARGETS, auditMerchantApprovals, readPilotCadReview, writePilotCadReview, type PilotCadReviewRow } from "./lib/pos-pilot-cad-corrections"

const CANADA_REGION_ID = "reg_01KVJF9HSCYKAZC677GH1AC6C8"
const lower = (value: unknown) => String(value ?? "").trim().toLowerCase()
const hasArg = (name: string) => process.argv.includes(name) || process.argv.includes(`--${name}`)

async function publishableKey(query: any) {
  if (process.env.MEDUSA_PUBLISHABLE_KEY) return process.env.MEDUSA_PUBLISHABLE_KEY
  const { data } = await query.graph({ entity: "api_key", fields: ["token", "type"], filters: { type: "publishable" } })
  return data?.[0]?.token || ""
}

async function calculatedCad(productId: string, variantId: string, token: string) {
  if (!token || typeof fetch !== "function") return ""
  const base = (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
  try {
    const response = await fetch(`${base}/store/products/${productId}?region_id=${CANADA_REGION_ID}&country_code=ca&fields=id,variants.id,variants.calculated_price.*`, { headers: { "x-publishable-api-key": token } })
    if (!response.ok) return ""
    const body: any = await response.json()
    return String(body.product?.variants?.find((variant: any) => variant.id === variantId)?.calculated_price?.calculated_amount ?? "")
  } catch { return "" }
}

export default async function auditPosPilotCadPrices({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const salesChannel = container.resolve(Modules.SALES_CHANNEL) as any
  const posService = container.resolve(POS_MODULE) as PosModuleService
  const [channels, registers, graph, token] = await Promise.all([
    salesChannel.listSalesChannels({}, { take: 100 }),
    posService.listPosRegisters({}, { take: 100 }),
    query.graph({ entity: "product", fields: [
      "id", "title", "sales_channels.id", "variants.id", "variants.title", "variants.barcode",
      "variants.prices.id", "variants.prices.price_set_id", "variants.prices.amount", "variants.prices.currency_code",
      "variants.inventory_items.inventory_item_id", "variants.inventory_items.inventory.location_levels.location_id",
      "variants.inventory_items.inventory.location_levels.stocked_quantity", "variants.inventory_items.inventory.location_levels.reserved_quantity",
    ], filters: { id: [...POS_PILOT_CAD_TARGETS.values()].map((entry) => entry.productId) }, pagination: { take: 20 } }),
    publishableKey(query),
  ])
  const posChannels = channels.filter((channel: any) => lower(channel.name) === "pos" && !channel.is_disabled)
  if (posChannels.length !== 1) throw new Error(`Expected one active POS sales channel; found ${posChannels.length}`)
  const channel = posChannels[0]
  const canada = (registers as any[]).find((register) => lower(register.currency_code) === "cad" && register.sales_channel_id === channel.id)
  if (!canada) throw new Error("Canada POS register was not found")

  const suspiciousPath = path.resolve(process.cwd(), "reports", "suspicious-cad-prices.csv")
  const suspiciousRows = fs.existsSync(suspiciousPath)
    ? readApprovedCsv(suspiciousPath, ["variant_id", "likely_minor_unit_seed", "status", "correction_reason", "approved_corrected_cad_price"]).map((entry) => entry.values)
    : []
  const suspiciousByVariant = new Map(suspiciousRows.map((row) => [row.variant_id, row]))
  const reviewPath = path.resolve(process.cwd(), "reports", "pos-pilot-cad-price-review.csv")
  const existing = fs.existsSync(reviewPath) ? (() => {
    try { return readPilotCadReview(reviewPath) }
    catch { return readApprovedCsv(reviewPath, ["variant_id", "approved_corrected_cad_price", "approval_status"]).map((entry) => ({ rowNumber: entry.rowNumber, values: entry.values as unknown as PilotCadReviewRow })) }
  })() : []
  const existingByVariant = new Map(existing.map((entry) => [entry.values.variant_id, entry.values]))
  const now = new Date().toISOString()
  const reviewRows: PilotCadReviewRow[] = []
  const auditRows: any[] = []

  for (const [variantId, target] of POS_PILOT_CAD_TARGETS) {
    const products = (graph.data || []).filter((product: any) => product.id === target.productId && product.title === target.title)
    if (products.length !== 1) throw new Error(`${target.title}: exact product identity did not resolve once`)
    const product = products[0]
    const variants = (product.variants || []).filter((variant: any) => variant.id === variantId)
    if (variants.length !== 1) throw new Error(`${target.title}: exact variant identity did not resolve once`)
    const variant = variants[0]
    const cad = (variant.prices || []).find((price: any) => lower(price.currency_code) === "cad")
    const usd = (variant.prices || []).find((price: any) => lower(price.currency_code) === "usd")
    if (!cad?.id || !cad?.price_set_id) throw new Error(`${target.title}: CAD price identity is missing`)
    const inventoryItems = variant.inventory_items || []
    const levels = inventoryItems.flatMap((item: any) => item.inventory?.location_levels || []).filter((level: any) => level.location_id === canada.stock_location_id)
    const stocked = levels.reduce((sum: number, level: any) => sum + Number(level.stocked_quantity || 0), 0)
    const reserved = levels.reduce((sum: number, level: any) => sum + Number(level.reserved_quantity || 0), 0)
    const calculated = await calculatedCad(product.id, variant.id, token)
    const suspicious = suspiciousByVariant.get(variant.id) || {}
    const prior = existingByVariant.get(variant.id)
    const approved = String(prior?.approval_status || "").trim() === "APPROVED"
    const liveRow: PilotCadReviewRow = {
      product_id: product.id, product_title: product.title, variant_id: variant.id, variant_title: variant.title || "",
      price_id: cad.id, price_set_id: cad.price_set_id, currency_code: "cad", current_cad_price: String(cad.amount),
      current_usd_price: String(usd?.amount ?? ""), calculated_cad_price: calculated,
      suspicious_reason: suspicious.correction_reason || suspicious.status || (suspicious.likely_minor_unit_seed === "yes" ? "suspicious_needs_review" : "manual_review"),
      expected_input_unit: "major units (CAD, max 2 decimals)", medusa_storage_unit: "major units (Medusa v2)",
      approved_corrected_cad_price: prior?.approved_corrected_cad_price || "", approval_status: prior?.approval_status || "PENDING",
      approved_by: prior?.approved_by || "", approval_reference: prior?.approval_reference || "", reviewed_at: prior?.reviewed_at || "", notes: prior?.notes || (prior as any)?.merchant_note || "",
      pos_channel_linked: String(Boolean(product.sales_channels?.some((entry: any) => entry.id === channel.id))), barcode: variant.barcode || "",
      inventory_item_id: inventoryItems.map((item: any) => item.inventory_item_id).filter(Boolean).join("|"), register_id: canada.id, region_id: canada.region_id, stock_location_id: canada.stock_location_id,
      stocked_quantity: String(stocked), reserved_quantity: String(reserved), available_quantity: String(Math.max(0, stocked - reserved)),
      audit_timestamp: now,
    }
    // An approved row retains its reviewed identity/snapshot so later catalog drift is detected as stale.
    reviewRows.push(approved ? { ...liveRow, price_id: prior!.price_id, price_set_id: prior!.price_set_id, current_cad_price: prior!.current_cad_price || (prior as any).current_cad_amount, currency_code: prior!.currency_code, approved_corrected_cad_price: prior!.approved_corrected_cad_price, approval_status: prior!.approval_status, approved_by: prior!.approved_by, approval_reference: prior!.approval_reference, reviewed_at: prior!.reviewed_at, audit_timestamp: prior!.audit_timestamp, notes: prior!.notes } : liveRow)
    auditRows.push({ productId: product.id, productTitle: product.title, variantId: variant.id, variantTitle: variant.title, currentCadPrice: Number(cad.amount), currentUsdPrice: usd?.amount ?? null, calculatedCadPrice: calculated || null, suspiciousReason: liveRow.suspicious_reason, approvedCorrectedCadPrice: liveRow.approved_corrected_cad_price || null, approvalStatus: liveRow.approval_status, approvedBy: liveRow.approved_by || null, approvalReference: liveRow.approval_reference || null, reviewedAt: liveRow.reviewed_at || null, notes: liveRow.notes || null, posChannelLinked: liveRow.pos_channel_linked === "true", barcode: liveRow.barcode, inventory: { inventoryItemIds: liveRow.inventory_item_id.split("|").filter(Boolean), registerId: canada.id, regionId: canada.region_id, stockLocationId: canada.stock_location_id, stockedQuantity: stocked, reservedQuantity: reserved, availableQuantity: Math.max(0, stocked - reserved) } })
  }
  // The merchant approval CSV is authorization evidence and is read-only by default.
  // A separate, explicit refresh mode exists only for a merchant-requested re-audit.
  if (hasArg("refresh-review")) writePilotCadReview(reviewPath, reviewRows)
  const approvalAudit = auditMerchantApprovals(reviewRows.map((values, index) => ({ rowNumber: index + 2, values })))
  console.log("[POS_PILOT_MERCHANT_APPROVAL_AUDIT]")
  console.log(JSON.stringify({ ...approvalAudit.summary, validationResults: approvalAudit.rows }, null, 2))
  console.log("[POS_PILOT_CAD_PRICE_AUDIT]")
  console.log(JSON.stringify({ productsAudited: auditRows.length, reviewPath, merchantInputContract: "major units with at most two decimals", canonicalValidationExample: "4.99 -> 499", medusaV2StorageContract: "major units; write 4.99, not 499", products: auditRows }, null, 2))
  const approvedRows = auditRows.filter((row) => row.approvalStatus === "APPROVED")
  const snapshotPath = path.resolve(process.cwd(), "reports", "final-pos-cad-pre-apply-snapshot.json")
  const snapshot = fs.existsSync(snapshotPath) ? JSON.parse(fs.readFileSync(snapshotPath, "utf8")) : null
  const beforeVariants = new Map<string, any>()
  for (const product of snapshot?.pilot || []) for (const variant of product.variants || []) beforeVariants.set(variant.id, variant)
  const storedCadMatches = approvedRows.filter((row) => Number(row.currentCadPrice) === Number(row.approvedCorrectedCadPrice)).length
  const calculatedCadMatches = approvedRows.filter((row) => Number(row.calculatedCadPrice) === Number(row.approvedCorrectedCadPrice)).length
  const suspiciousFlagsRemaining = approvedRows.filter((row) => Number(row.currentCadPrice) !== Number(row.approvedCorrectedCadPrice)).length
  const usdUnchanged = Boolean(snapshot) && approvedRows.every((row) => {
    const before = beforeVariants.get(row.variantId)
    return before && (before.usdPrice === null ? row.currentUsdPrice === null : Number(before.usdPrice) === Number(row.currentUsdPrice))
  })
  const barcodesUnchanged = Boolean(snapshot) && approvedRows.every((row) => beforeVariants.get(row.variantId)?.barcode === row.barcode)
  const inventoryUnchanged = Boolean(snapshot) && approvedRows.every((row) => {
    const before = beforeVariants.get(row.variantId)
    if (!before) return false
    const levels = (before.inventory || []).flatMap((item: any) => item.levels || []).filter((level: any) => level.locationId === row.inventory.stockLocationId)
    return levels.reduce((sum: number, level: any) => sum + Number(level.stockedQuantity || 0), 0) === row.inventory.stockedQuantity
      && levels.reduce((sum: number, level: any) => sum + Number(level.reservedQuantity || 0), 0) === row.inventory.reservedQuantity
  })
  const verification = { approvedVariantsChecked: approvedRows.length, storedCadMatches, calculatedCadMatches, suspiciousFlagsRemaining, usdUnchanged, barcodesUnchanged, inventoryUnchanged, passed: approvedRows.length > 0 && storedCadMatches === approvedRows.length && calculatedCadMatches === approvedRows.length && suspiciousFlagsRemaining === 0 && usdUnchanged && barcodesUnchanged && inventoryUnchanged }
  console.log("[FINAL_POS_CAD_STORE_API_VERIFICATION]")
  console.log(JSON.stringify(verification, null, 2))
}
