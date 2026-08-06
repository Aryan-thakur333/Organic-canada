import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createHash } from "crypto"
import * as fs from "fs"
import * as path from "path"
import { readPilotCadReview } from "./lib/pos-pilot-cad-corrections"
import { POS_BARCODE_PILOT_TITLES } from "./lib/pos-barcode-pilot"

const hasArg = (name: string) => process.argv.includes(name) || process.argv.includes(`--${name}`)
const lower = (value: unknown) => String(value ?? "").toLowerCase()
const stable = (value: unknown) => JSON.stringify(value)
const hash = (value: unknown) => createHash("sha256").update(stable(value)).digest("hex")

function normalizeProduct(product: any, calculated: Map<string, { cad: number | null; usd: number | null }>) {
  return {
    id: product.id, title: product.title, status: product.status,
    vendorOwnership: product.vendor?.id || product.metadata?.vendor_id || "PLATFORM",
    salesChannels: (product.sales_channels || []).map((entry: any) => entry.id).sort(),
    variants: (product.variants || []).map((variant: any) => ({
      id: variant.id, sku: variant.sku || null, barcode: variant.barcode || null, upc: variant.upc || null, ean: variant.ean || null,
      cadPrice: (variant.prices || []).find((price: any) => lower(price.currency_code) === "cad")?.amount ?? null,
      usdPrice: (variant.prices || []).find((price: any) => lower(price.currency_code) === "usd")?.amount ?? null,
      calculatedCadPrice: calculated.get(variant.id)?.cad ?? null,
      calculatedUsdPrice: calculated.get(variant.id)?.usd ?? null,
      cadPriceRecords: (variant.prices || []).filter((price: any) => lower(price.currency_code) === "cad").length,
      inventory: (variant.inventory_items || []).map((item: any) => ({ inventoryItemId: item.inventory_item_id, levels: (item.inventory?.location_levels || []).map((level: any) => ({ locationId: level.location_id, stockedQuantity: Number(level.stocked_quantity || 0), reservedQuantity: Number(level.reserved_quantity || 0) })).sort((a: any, b: any) => a.locationId.localeCompare(b.locationId)) })).sort((a: any, b: any) => String(a.inventoryItemId).localeCompare(String(b.inventoryItemId))),
    })).sort((a: any, b: any) => a.id.localeCompare(b.id)),
  }
}

async function state(container: any) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const channels = await container.resolve(Modules.SALES_CHANNEL).listSalesChannels({}, { take: 100 })
  const pos = channels.filter((channel: any) => String(channel.name || "").trim().toUpperCase() === "POS" && !channel.is_disabled)
  if (pos.length !== 1) throw new Error(`Expected one active POS channel; found ${pos.length}`)
  const { data } = await query.graph({ entity: "product", fields: [
    "id", "title", "status", "metadata", "vendor.id", "sales_channels.id",
    "variants.id", "variants.sku", "variants.barcode", "variants.upc", "variants.ean",
    "variants.prices.amount", "variants.prices.currency_code",
    "variants.inventory_items.inventory_item_id", "variants.inventory_items.inventory.location_levels.location_id",
    "variants.inventory_items.inventory.location_levels.stocked_quantity", "variants.inventory_items.inventory.location_levels.reserved_quantity",
  ], pagination: { take: 10000 } })
  const calculated = new Map<string, { cad: number | null; usd: number | null }>()
  const keyGraph = await query.graph({ entity: "api_key", fields: ["token", "type"], filters: { type: "publishable" } })
  const token = keyGraph.data?.[0]?.token
  const regions = await container.resolve(Modules.REGION).listRegions({}, { take: 100 })
  const regionByCurrency = new Map((regions || []).map((region: any) => [lower(region.currency_code), region.id]))
  if (!token || !regionByCurrency.get("cad") || !regionByCurrency.get("usd")) throw new Error("Calculated-price snapshot requires a publishable key and CAD/USD regions")
  const baseUrl = String(process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
  for (const product of (data || []).filter((entry: any) => (POS_BARCODE_PILOT_TITLES as readonly string[]).includes(entry.title))) {
    for (const [currency, country] of [["cad", "ca"], ["usd", "us"]] as const) {
      const url = `${baseUrl}/store/products/${product.id}?region_id=${regionByCurrency.get(currency)}&country_code=${country}&fields=id,variants.id,variants.calculated_price.*`
      const response = await fetch(url, { headers: { "x-publishable-api-key": token } })
      if (!response.ok) throw new Error(`Calculated-price snapshot failed for ${product.title}/${currency}: HTTP ${response.status}`)
      const body = await response.json() as any
      for (const variant of body.product?.variants || []) {
        const value = variant.calculated_price?.calculated_amount
        const existing = calculated.get(variant.id) || { cad: null, usd: null }
        existing[currency] = Number.isFinite(Number(value)) ? Number(value) : null
        calculated.set(variant.id, existing)
      }
    }
  }
  const normalized = (data || []).map((product: any) => normalizeProduct(product, calculated)).sort((a: any, b: any) => a.id.localeCompare(b.id))
  const pilot = normalized.filter((product: any) => (POS_BARCODE_PILOT_TITLES as readonly string[]).includes(product.title))
  if (pilot.length !== 5) throw new Error(`Expected five pilot products; found ${pilot.length}`)
  const nonPilot = normalized.filter((product: any) => !(POS_BARCODE_PILOT_TITLES as readonly string[]).includes(product.title))
  return { posChannelId: pos[0].id, pilot, nonPilotHash: hash(nonPilot), nonPilotProducts: nonPilot.length }
}

export default async function snapshotPosPilotState({ container }: ExecArgs) {
  const snapshotPath = path.resolve(process.cwd(), "reports", "final-pos-cad-pre-apply-snapshot.json")
  const current = await state(container)
  const capture = hasArg("capture") || (!hasArg("compare") && !fs.existsSync(snapshotPath))
  if (capture) {
    fs.writeFileSync(snapshotPath, JSON.stringify({ capturedAt: new Date().toISOString(), ...current }, null, 2) + "\n", "utf8")
    console.log("[POS_PILOT_PRE_APPLY_SNAPSHOT]")
    console.log(JSON.stringify({ snapshotPath, pilotVariants: current.pilot.reduce((sum: number, product: any) => sum + product.variants.length, 0), nonPilotProducts: current.nonPilotProducts, captured: true }, null, 2))
    console.log("[FINAL_POS_CAD_PRE_APPLY_SNAPSHOT]")
    console.log(JSON.stringify({ snapshotPath, pilotProducts: current.pilot.length, pilotVariants: current.pilot.reduce((sum: number, product: any) => sum + product.variants.length, 0), calculatedCadCaptured: current.pilot.every((product: any) => product.variants.every((variant: any) => variant.calculatedCadPrice !== null)), calculatedUsdCaptured: current.pilot.every((product: any) => product.variants.every((variant: any) => variant.calculatedUsdPrice !== null)), captured: true }, null, 2))
    return
  }
  if (!fs.existsSync(snapshotPath)) throw new Error(`Pre-apply snapshot is missing: ${snapshotPath}`)
  const before = JSON.parse(fs.readFileSync(snapshotPath, "utf8"))
  const approvals = readPilotCadReview(path.resolve(process.cwd(), "reports", "pos-pilot-cad-price-review.csv"))
  const approvedByVariant = new Map(approvals.filter((row) => row.values.approval_status.trim() === "APPROVED").map((row) => [row.values.variant_id, Number(row.values.approved_corrected_cad_price)]))
  let approvedCadPriceChanges = 0, expectedPosLinksCreated = 0, unexpectedBarcodeChanges = 0, unexpectedUsdPriceChanges = 0, unexpectedInventoryChanges = 0
  const unexpectedChanges: string[] = []
  for (const afterProduct of current.pilot) {
    const beforeProduct = before.pilot.find((product: any) => product.id === afterProduct.id)
    if (!beforeProduct) { unexpectedChanges.push(`${afterProduct.id}: missing from pre-apply snapshot`); continue }
    if (beforeProduct.status !== afterProduct.status || beforeProduct.vendorOwnership !== afterProduct.vendorOwnership) unexpectedChanges.push(`${afterProduct.id}: status or vendor ownership changed`)
    const beforeOther = beforeProduct.salesChannels.filter((id: string) => id !== current.posChannelId).sort()
    const afterOther = afterProduct.salesChannels.filter((id: string) => id !== current.posChannelId).sort()
    if (stable(beforeOther) !== stable(afterOther)) unexpectedChanges.push(`${afterProduct.id}: non-POS sales-channel membership changed`)
    if (!beforeProduct.salesChannels.includes(current.posChannelId) && afterProduct.salesChannels.includes(current.posChannelId)) expectedPosLinksCreated++
    for (const afterVariant of afterProduct.variants) {
      const beforeVariant = beforeProduct.variants.find((variant: any) => variant.id === afterVariant.id)
      if (!beforeVariant) { unexpectedChanges.push(`${afterVariant.id}: variant identity changed`); continue }
      if (beforeVariant.barcode !== afterVariant.barcode || beforeVariant.sku !== afterVariant.sku || beforeVariant.upc !== afterVariant.upc || beforeVariant.ean !== afterVariant.ean) unexpectedBarcodeChanges++
      if (Number(beforeVariant.usdPrice) !== Number(afterVariant.usdPrice) || (beforeVariant.usdPrice === null) !== (afterVariant.usdPrice === null)) unexpectedUsdPriceChanges++
      if (stable(beforeVariant.inventory) !== stable(afterVariant.inventory)) unexpectedInventoryChanges++
      if (Number(beforeVariant.cadPrice) !== Number(afterVariant.cadPrice)) {
        if (approvedByVariant.get(afterVariant.id) === Number(afterVariant.cadPrice)) approvedCadPriceChanges++
        else unexpectedChanges.push(`${afterVariant.id}: unapproved CAD price change`)
      }
      if (afterVariant.cadPriceRecords !== 1) unexpectedChanges.push(`${afterVariant.id}: expected exactly one CAD price record`)
    }
  }
  const unexpectedNonPilotChanges = before.nonPilotHash === current.nonPilotHash ? 0 : 1
  const marker = { approvedCadPriceChanges, expectedPosLinksCreated, unexpectedBarcodeChanges, unexpectedUsdPriceChanges, unexpectedInventoryChanges, unexpectedNonPilotChanges, unexpectedChanges, passed: unexpectedBarcodeChanges === 0 && unexpectedUsdPriceChanges === 0 && unexpectedInventoryChanges === 0 && unexpectedNonPilotChanges === 0 && unexpectedChanges.length === 0 }
  console.log("[POS_PILOT_FINAL_DATA_INTEGRITY]")
  console.log(JSON.stringify(marker, null, 2))
  console.log("[FINAL_POS_DATA_INTEGRITY]")
  console.log(JSON.stringify({ approvedCadChanges: marker.approvedCadPriceChanges, intendedPosLinks: marker.expectedPosLinksCreated, unexpectedBarcodeChanges: marker.unexpectedBarcodeChanges, unexpectedUsdChanges: marker.unexpectedUsdPriceChanges, unexpectedInventoryChanges: marker.unexpectedInventoryChanges, unexpectedNonPilotChanges: marker.unexpectedNonPilotChanges, passed: marker.passed }, null, 2))
  if (!marker.passed) throw new Error(`POS pilot data-integrity comparison failed: ${JSON.stringify(marker)}`)
}
