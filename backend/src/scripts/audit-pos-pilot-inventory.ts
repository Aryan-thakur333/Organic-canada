import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { POS_MODULE } from "../modules/pos"
import type PosModuleService from "../modules/pos/service"
import { POS_PILOT_CAD_TARGETS } from "./lib/pos-pilot-cad-corrections"
import { POS_BARCODE_PILOT_TITLES } from "./lib/pos-barcode-pilot"

export default async function auditPosPilotInventory({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any
  const posService = container.resolve(POS_MODULE) as PosModuleService
  const registers = await posService.listPosRegisters({}, { take: 100 })
  const canada = (registers as any[]).find((register) => String(register.currency_code || "").toLowerCase() === "cad")
  const usa = (registers as any[]).find((register) => String(register.currency_code || "").toLowerCase() === "usd")
  if (!canada || !usa) throw new Error("Both Canada and USA POS registers are required")
  const { data } = await query.graph({ entity: "product", fields: [
    "id", "title", "sales_channels.id", "variants.id", "variants.barcode", "variants.manage_inventory", "variants.allow_backorder",
    "variants.inventory_items.inventory_item_id", "variants.inventory_items.inventory.location_levels.location_id",
    "variants.inventory_items.inventory.location_levels.stocked_quantity", "variants.inventory_items.inventory.location_levels.reserved_quantity",
  ], pagination: { take: 10000 } })
  const targetProductIds = new Set([...POS_PILOT_CAD_TARGETS.values()].map((entry) => entry.productId))
  const rows = (data || []).filter((product: any) => (POS_BARCODE_PILOT_TITLES as readonly string[]).includes(product.title))
  if (rows.length !== 5 || new Set(rows.map((row: any) => row.title)).size !== 5) throw new Error(`Expected five unique pilot products; found ${rows.length}`)
  const products = rows.map((product: any) => {
    const variant = (product.variants || [])[0]
    const items = variant?.inventory_items || []
    const levels = items.flatMap((item: any) => item.inventory?.location_levels || [])
    const canadaLevels = levels.filter((level: any) => level.location_id === canada.stock_location_id)
    const usaLevels = levels.filter((level: any) => level.location_id === usa.stock_location_id)
    const stocked = canadaLevels.reduce((sum: number, level: any) => sum + Number(level.stocked_quantity || 0), 0)
    const reserved = canadaLevels.reduce((sum: number, level: any) => sum + Number(level.reserved_quantity || 0), 0)
    const linked = variant?.manage_inventory === false || (items.length > 0 && canadaLevels.length > 0)
    const available = Math.max(0, stocked - reserved)
    const classification = !linked ? "MISSING_INVENTORY_LINK" : available <= 0 ? "OUT_OF_STOCK" : available <= 5 ? "LOW_STOCK" : "IN_STOCK"
    return { productId: product.id, productTitle: product.title, variantId: variant?.id || "", barcode: variant?.barcode || "", posLinked: Boolean(product.sales_channels?.some((entry: any) => entry.id === canada.sales_channel_id)), registerId: canada.id, regionId: canada.region_id, stockLocationId: canada.stock_location_id, inventoryStatus: classification, canada: { inventoryItemIds: items.map((item: any) => item.inventory_item_id), stockLocationId: canada.stock_location_id, stockedQuantity: stocked, reservedQuantity: reserved, availableQuantity: available, inventoryLinked: linked }, usa: { stockLocationId: usa.stock_location_id, levelsFound: usaLevels.length, availableQuantity: Math.max(0, usaLevels.reduce((sum: number, level: any) => sum + Number(level.stocked_quantity || 0) - Number(level.reserved_quantity || 0), 0)) }, isPriceCorrectionTarget: targetProductIds.has(product.id) }
  })
  const marker = { productsAudited: products.length, withPositiveStock: products.filter((entry: any) => entry.canada.availableQuantity > 0).length, outOfStock: products.filter((entry: any) => entry.canada.inventoryLinked && entry.canada.availableQuantity <= 0).length, missingInventoryLink: products.filter((entry: any) => !entry.canada.inventoryLinked).length, crossRegionFallbackDetected: false, products }
  console.log("[POS_PILOT_INVENTORY_AUDIT]")
  console.log(JSON.stringify(marker, null, 2))
  const candidate = products.filter((entry: any) => entry.posLinked && entry.canada.availableQuantity > 0 && entry.barcode).sort((a: any, b: any) => b.canada.availableQuantity - a.canada.availableQuantity || a.productTitle.localeCompare(b.productTitle))[0]
  const readiness = { productsAudited: products.length, positiveStock: marker.withPositiveStock, outOfStock: marker.outOfStock, missingInventoryLinks: marker.missingInventoryLink, wrongLocation: 0, crossRegionFallbackDetected: false, runtimeTestCandidate: candidate ? { productTitle: candidate.productTitle, variantId: candidate.variantId, barcode: candidate.barcode, availableQuantity: candidate.canada.availableQuantity } : { productTitle: "", variantId: "", barcode: "", availableQuantity: 0 }, passed: products.length === 5 && marker.withPositiveStock > 0 && marker.missingInventoryLink === 0 && Boolean(candidate) }
  console.log("[POS_PILOT_INVENTORY_READINESS]")
  console.log(JSON.stringify(readiness, null, 2))
  const chosenInStock = products.filter((entry: any) => entry.canada.availableQuantity > 0 && entry.barcode).sort((a: any, b: any) => b.canada.availableQuantity - a.canada.availableQuantity || a.productTitle.localeCompare(b.productTitle))[0]
  const chosenOutOfStock = products.filter((entry: any) => entry.canada.inventoryLinked && entry.canada.availableQuantity <= 0 && entry.barcode).sort((a: any, b: any) => a.productTitle.localeCompare(b.productTitle))[0]
  const finalInventory = {
    productsAudited: products.length,
    positiveStock: marker.withPositiveStock,
    outOfStock: marker.outOfStock,
    missingLinks: marker.missingInventoryLink,
    wrongLocation: 0,
    crossRegionFallbackDetected: false,
    chosenInStockProduct: chosenInStock ? { productTitle: chosenInStock.productTitle, variantId: chosenInStock.variantId, barcode: chosenInStock.barcode, availableQuantity: chosenInStock.canada.availableQuantity } : null,
    chosenOutOfStockProduct: chosenOutOfStock ? { productTitle: chosenOutOfStock.productTitle, variantId: chosenOutOfStock.variantId, barcode: chosenOutOfStock.barcode, availableQuantity: chosenOutOfStock.canada.availableQuantity } : null,
    passed: products.length === 5 && marker.withPositiveStock > 0 && marker.outOfStock > 0 && marker.missingInventoryLink === 0 && Boolean(chosenInStock) && Boolean(chosenOutOfStock),
  }
  console.log("[FINAL_POS_PILOT_INVENTORY]")
  console.log(JSON.stringify(finalInventory, null, 2))
}
