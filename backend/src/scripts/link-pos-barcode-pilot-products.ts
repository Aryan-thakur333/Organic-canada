import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { linkProductsToSalesChannelWorkflow } from "@medusajs/core-flows"
import { POS_MODULE } from "../modules/pos"
import type PosModuleService from "../modules/pos/service"
import * as fs from "fs"
import * as path from "path"
import { normalizeIdentifier, readBarcodeAuditCsv, validateInternalBarcode, writeBarcodeAuditCsv } from "./lib/variant-barcodes"
import { classifyPilotProducts, POS_BARCODE_PILOT_TITLES, unresolvedSuspiciousCadPriceProductIds, type PilotProduct, type PilotRegister } from "./lib/pos-barcode-pilot"

const arg = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3).trim() || ""

function variantSnapshot(variants: any[] = []) {
  return variants.map((variant) => ({
    id: variant.id, sku: variant.sku || null, barcode: variant.barcode || null, upc: variant.upc || null, ean: variant.ean || null,
    prices: (variant.prices || []).map((price: any) => ({ currency_code: String(price.currency_code || "").toLowerCase(), amount: Number(price.amount) })).sort((a: any, b: any) => a.currency_code.localeCompare(b.currency_code) || a.amount - b.amount),
    inventory: (variant.inventory_items || []).map((item: any) => ({ inventory_item_id: item.inventory_item_id, levels: (item.inventory?.location_levels || []).map((level: any) => ({ location_id: level.location_id, stocked_quantity: Number(level.stocked_quantity || 0), reserved_quantity: Number(level.reserved_quantity || 0) })).sort((a: any, b: any) => a.location_id.localeCompare(b.location_id)) })).sort((a: any, b: any) => String(a.inventory_item_id).localeCompare(String(b.inventory_item_id))),
  })).sort((a, b) => a.id.localeCompare(b.id))
}

export default async function linkPosBarcodePilotProducts({ container }: ExecArgs) {
  const requestedMode = arg("mode") || (process.argv.includes("--apply") ? "apply" : process.argv.includes("--dry-run") ? "dry-run" : "report")
  if (!["report", "dry-run", "apply"].includes(requestedMode)) throw new Error("mode must be report, dry-run, or apply")
  if (requestedMode === "apply" && !process.argv.includes("--apply")) throw new Error("Apply mode requires the explicit --apply flag")
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as { graph(input: Record<string, unknown>): Promise<{ data: unknown[] }> }
  const channelService = container.resolve(Modules.SALES_CHANNEL) as { listSalesChannels(filters: Record<string, unknown>, config: Record<string, unknown>): Promise<Array<{ id: string; name: string; is_disabled?: boolean }>> }
  const posService = container.resolve(POS_MODULE) as PosModuleService
  const [channels, registers, productGraph, locationGraph] = await Promise.all([
    channelService.listSalesChannels({}, { take: 100 }),
    posService.listPosRegisters({}, { take: 100 }),
    query.graph({ entity: "product", fields: [
      "id", "title", "handle", "status", "deleted_at", "metadata", "type.value", "collection.id", "collection.title",
      "shipping_profile.id", "shipping_profile_id", "sales_channels.id", "sales_channels.name", "vendor.id", "vendor.name",
      "variants.id", "variants.title", "variants.sku", "variants.barcode", "variants.upc", "variants.ean", "variants.deleted_at",
      "variants.manage_inventory", "variants.allow_backorder", "variants.metadata", "variants.prices.amount", "variants.prices.currency_code",
      "variants.inventory_items.inventory_item_id", "variants.inventory_items.inventory.location_levels.location_id",
      "variants.inventory_items.inventory.location_levels.stocked_quantity", "variants.inventory_items.inventory.location_levels.reserved_quantity",
    ], pagination: { take: 10000 } }),
    query.graph({ entity: "stock_location", fields: ["id", "name", "address.country_code", "sales_channels.id", "sales_channels.name"], pagination: { take: 1000 } }),
  ])
  const posChannels = channels.filter((channel) => channel.name.trim().toUpperCase() === "POS" && !channel.is_disabled)
  if (posChannels.length !== 1) throw new Error(`Expected exactly one active POS sales channel; found ${posChannels.length}`)
  const channel = posChannels[0]
  const posRegisters = (registers as PilotRegister[]).filter((register) => register.sales_channel_id === channel.id)
  const products = productGraph.data as PilotProduct[]
  const unsafePrices = unresolvedSuspiciousCadPriceProductIds(path.resolve(process.cwd(), "reports", "suspicious-cad-prices.csv"), products)
  const decisions = classifyPilotProducts(products, channel.id, posRegisters, unsafePrices)
  const missingOrInvalidBarcode = decisions.filter((decision) => decision.resolved && decision.variants.some((variant) => !normalizeIdentifier(variant.barcode) || validateInternalBarcode(variant.barcode).length > 0))
  const barcodeBlockedIds = new Set(missingOrInvalidBarcode.map((decision) => decision.product?.id).filter(Boolean))
  const planned = decisions.filter((decision) => decision.classification === "ELIGIBLE" && !barcodeBlockedIds.has(decision.product?.id))
  const before = new Map(decisions.filter((decision) => decision.product).map((decision) => [decision.product!.id, {
    channels: (decision.product!.sales_channels || []).map((entry) => entry.id).sort(), status: decision.product!.status,
    vendor: decision.vendorOwnership,
    variants: variantSnapshot(decision.variants),
  }]))
  const audit = {
    requestedProducts: POS_BARCODE_PILOT_TITLES.length,
    resolvedProducts: decisions.filter((decision) => decision.resolved).length,
    eligibleProducts: decisions.filter((decision) => ["ELIGIBLE", "ALREADY_LINKED"].includes(decision.classification)).length,
    ineligibleProducts: decisions.filter((decision) => !["ELIGIBLE", "ALREADY_LINKED"].includes(decision.classification)).map((decision) => ({ title: decision.title, classification: decision.classification, reasons: decision.reasons })),
    variantsResolved: decisions.reduce((sum, decision) => sum + decision.variants.length, 0),
    existingIdentifiers: decisions.flatMap((decision) => decision.variants).filter((variant) => variant.barcode || variant.upc || variant.ean).length,
    missingIdentifiers: decisions.flatMap((decision) => decision.variants).filter((variant) => !variant.barcode && !variant.upc && !variant.ean).length,
    products: decisions.map((decision) => ({
      title: decision.title, productId: decision.product?.id || "", handle: decision.product?.handle || "", status: decision.product?.status || "",
      type: decision.product?.type?.value || decision.product?.metadata?.product_type || "standard", collection: decision.product?.collection?.title || "",
      classification: decision.classification, reasons: decision.reasons, physical: decision.physical, vendorOwnership: decision.vendorOwnership,
      salesChannels: decision.product?.sales_channels || [], canadaPriceAvailable: decision.canadaPriceAvailable, usaPriceAvailable: decision.usaPriceAvailable,
      canadaInventoryLinked: decision.canadaInventoryLinked, canadaInventoryAvailable: decision.canadaInventoryAvailable,
      usaInventoryLinked: decision.usaInventoryLinked, usaInventoryAvailable: decision.usaInventoryAvailable,
      fulfillmentEligibility: decision.physical ? "POS_IMMEDIATE_CARRYOUT" : "INELIGIBLE",
      variants: decision.variants.map((variant) => ({
        id: variant.id, title: variant.title, sku: variant.sku, barcode: variant.barcode, upc: variant.upc, ean: variant.ean,
        prices: (variant.prices || []).map((price) => ({ currency: String(price.currency_code).toLowerCase(), amount: Number(price.amount) })).sort((a, b) => a.currency.localeCompare(b.currency)),
        inventoryItems: (variant.inventory_items || []).map((item) => ({ inventoryItemId: item.inventory_item_id, levels: (item.inventory?.location_levels || []).map((level) => ({ locationId: level.location_id, stocked: Number(level.stocked_quantity || 0), reserved: Number(level.reserved_quantity || 0), available: Math.max(0, Number(level.stocked_quantity || 0) - Number(level.reserved_quantity || 0)) })) })),
      })),
    })),
  }
  console.log("[POS_BARCODE_PILOT_PRODUCT_AUDIT]")
  console.log(JSON.stringify(audit, null, 2))
  console.log("[POS_SALES_CHANNEL]")
  console.log(JSON.stringify({ id: channel.id, name: channel.name, status: channel.is_disabled ? "DISABLED" : "ACTIVE", linkedStockLocations: (locationGraph.data as any[]).filter((location) => location.sales_channels?.some((entry: any) => entry.id === channel.id)).map((location) => ({ id: location.id, name: location.name, countryCode: location.address?.country_code || "" })), linkedRegisters: posRegisters.map((register) => ({ id: register.id, name: register.name, status: register.status, regionId: register.region_id, currency: register.currency_code, stockLocationId: register.stock_location_id })), linkedProducts: products.filter((product) => product.sales_channels?.some((entry) => entry.id === channel.id)).length }, null, 2))
  const dryRun = { productsRequested: POS_BARCODE_PILOT_TITLES.length, productsResolved: audit.resolvedProducts, alreadyLinked: decisions.filter((decision) => decision.classification === "ALREADY_LINKED").length, plannedLinks: planned.length, ineligible: audit.ineligibleProducts.length + missingOrInvalidBarcode.filter((decision) => decision.classification === "ELIGIBLE").length, missingProducts: decisions.filter((decision) => !decision.resolved).length, duplicateLinkRequests: planned.length - new Set(planned.map((decision) => decision.product?.id)).size, databaseWrites: 0 }
  if (requestedMode !== "apply") {
    const auditPath = path.resolve(process.cwd(), "reports", "product-variant-barcode-audit.csv")
    const snapshotPath = path.resolve(process.cwd(), "reports", "pilot-pos-barcode-audit-before.json")
    if (fs.existsSync(auditPath)) {
      const allRows = readBarcodeAuditCsv(auditPath)
      const rows = allRows.filter((row) => (POS_BARCODE_PILOT_TITLES as readonly string[]).includes(row.product_title))
      if (!fs.existsSync(snapshotPath)) fs.writeFileSync(snapshotPath, JSON.stringify({ capturedAt: new Date().toISOString(), rows }, null, 2) + "\n", "utf8")
      const fullSnapshotPath = path.resolve(process.cwd(), "reports", "product-variant-barcode-audit-before-pilot.csv")
      if (!fs.existsSync(fullSnapshotPath)) writeBarcodeAuditCsv(fullSnapshotPath, allRows)
    }
    console.log(requestedMode === "dry-run" ? "[POS_PILOT_SALES_CHANNEL_LINK_DRY_RUN]" : "[POS_PILOT_SALES_CHANNEL_LINK_REPORT]")
    console.log(JSON.stringify(dryRun, null, 2))
    const blockedByPrice = decisions.filter((decision) => decision.reasons.some((reason) => reason.includes("merchant price approval") || reason.includes("safe positive CAD price"))).length
    const relink = { pilotProductsRequested: POS_BARCODE_PILOT_TITLES.length, alreadyLinked: dryRun.alreadyLinked, plannedLinks: dryRun.plannedLinks, blockedByPrice, blockedByCatalog: decisions.filter((decision) => ["INELIGIBLE_STATUS", "INELIGIBLE_TYPE"].includes(decision.classification) || decision.reasons.some((reason) => reason.includes("catalog") || reason.includes("security"))).length, blockedByMissingBarcode: missingOrInvalidBarcode.length, blockedByMissingInventoryLink: decisions.filter((decision) => decision.classification === "MISSING_INVENTORY_LINK").length, invalidProducts: decisions.filter((decision) => !decision.resolved).length, databaseWrites: 0, passed: dryRun.alreadyLinked + dryRun.plannedLinks === POS_BARCODE_PILOT_TITLES.length && dryRun.ineligible === 0 }
    console.log("[POS_PILOT_RELINK_DRY_RUN]")
    console.log(JSON.stringify(relink, null, 2))
    console.log("[FINAL_POS_RELINK_DRY_RUN]")
    console.log(JSON.stringify({ pilotProducts: relink.pilotProductsRequested, alreadyLinked: relink.alreadyLinked, plannedLinks: relink.plannedLinks, blockedByPrice: relink.blockedByPrice, blockedByBarcode: relink.blockedByMissingBarcode, blockedByCatalog: relink.blockedByCatalog, missingInventoryLinks: relink.blockedByMissingInventoryLink, databaseWrites: 0, passed: relink.passed }, null, 2))
    return
  }
  if (dryRun.duplicateLinkRequests || dryRun.missingProducts || dryRun.ineligible) throw new Error(`POS pilot link apply blocked: ${JSON.stringify(dryRun)}`)
  let createdLinks = 0
  let auditRecords = 0
  if (planned.length) {
    await linkProductsToSalesChannelWorkflow(container).run({ input: { id: channel.id, add: planned.map((decision) => decision.product!.id) } })
    createdLinks = planned.length
    for (const decision of planned) {
      await posService.createPosAuditEvents({ event_type: "POS_PILOT_PRODUCT_LINKED", message: "Approved pilot product linked to POS sales channel", metadata: { product_id: decision.product!.id, product_title: decision.title, sales_channel_id: channel.id } })
      auditRecords++
    }
  }
  const verifiedGraph = await query.graph({ entity: "product", fields: ["id", "status", "sales_channels.id", "vendor.id", "metadata", "variants.id", "variants.sku", "variants.barcode", "variants.upc", "variants.ean", "variants.prices.amount", "variants.prices.currency_code", "variants.inventory_items.inventory_item_id", "variants.inventory_items.inventory.location_levels.location_id", "variants.inventory_items.inventory.location_levels.stocked_quantity", "variants.inventory_items.inventory.location_levels.reserved_quantity"], filters: { id: decisions.map((decision) => decision.product?.id).filter(Boolean) }, pagination: { take: 100 } })
  const failures: string[] = []
  for (const product of verifiedGraph.data as PilotProduct[]) {
    const snapshot = before.get(product.id)
    if (!product.sales_channels?.some((entry) => entry.id === channel.id)) failures.push(`${product.id}: POS link missing after apply`)
    const currentOther = (product.sales_channels || []).map((entry) => entry.id).filter((id) => id !== channel.id).sort()
    const beforeOther = (snapshot?.channels || []).filter((id) => id !== channel.id).sort()
    if (JSON.stringify(currentOther) !== JSON.stringify(beforeOther)) failures.push(`${product.id}: non-POS sales channel memberships changed`)
    if (product.status !== snapshot?.status) failures.push(`${product.id}: status changed`)
    if (JSON.stringify(variantSnapshot(product.variants || [])) !== JSON.stringify(snapshot?.variants)) failures.push(`${product.id}: identifier, price, or inventory snapshot changed`)
  }
  if (failures.length) throw new Error(`POS pilot post-link verification failed: ${failures.join("; ")}`)
  console.log("[POS_PILOT_SALES_CHANNEL_LINK_APPLY]")
  console.log(JSON.stringify({ plannedLinks: planned.length, createdLinks, alreadyLinked: decisions.filter((decision) => decision.classification === "ALREADY_LINKED").length, failedLinks: 0, databaseWrites: createdLinks + auditRecords, auditRecords }, null, 2))
  console.log("[POS_PILOT_RELINK_APPLY]")
  const relinkApply = { createdLinks, alreadyLinked: decisions.filter((decision) => decision.classification === "ALREADY_LINKED").length, failedLinks: 0, duplicateLinks: 0, databaseWrites: createdLinks + auditRecords, passed: failures.length === 0 }
  console.log(JSON.stringify(relinkApply, null, 2))
  console.log("[FINAL_POS_RELINK_APPLY]")
  console.log(JSON.stringify(relinkApply, null, 2))
}
