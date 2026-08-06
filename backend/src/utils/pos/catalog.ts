import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import type { MedusaRequest } from "@medusajs/framework/http"
import { POS_MODULE } from "../../modules/pos"
import { PosError, type PosRecord, type PosService } from "./contracts"
import { nativeAmountToMinor } from "./money"

type GraphVariant = {
  id: string; title?: string; sku?: string; barcode?: string; upc?: string; ean?: string; allow_backorder?: boolean;
  prices?: Array<{ amount: number; currency_code: string }>;
  product?: { id: string; title?: string; handle?: string; thumbnail?: string; status?: string; metadata?: Record<string, unknown>; sales_channels?: Array<{ id: string }>; vendor?: { id: string; name?: string } };
  inventory_items?: Array<{ inventory_item_id: string; inventory?: { location_levels?: Array<{ location_id: string; stocked_quantity: number; reserved_quantity: number }> } }>;
}

export const POS_QR_PREFIX = "EATSIE-POS:"

export function buildPosVariantQrPayload(variantId: string): string {
  const normalized = String(variantId || "").trim()
  if (!normalized || normalized.length > 128) throw new PosError("POS_SCAN_INVALID", "Valid POS variant ID is required", 400)
  return `${POS_QR_PREFIX}${normalized}`
}

export function parsePosVariantQrPayload(code: string): string | null {
  const normalized = normalizePosLookupCode(code)
  if (!normalized.startsWith(POS_QR_PREFIX)) return null
  const variantId = normalized.slice(POS_QR_PREFIX.length).trim()
  if (!variantId || variantId.length > 128) throw new PosError("POS_SCAN_INVALID", "Invalid POS QR payload", 400)
  return variantId
}

export async function loadRegister(req: MedusaRequest, registerId: string) {
  const service = req.scope.resolve(POS_MODULE) as PosService
  const register = await service.retrievePosRegister(registerId) as PosRecord
  if (!register) throw new PosError("POS_REGISTER_NOT_FOUND", "Register not found", 404)
  if (!String(register.sales_channel_id || "").trim()) throw new PosError("POS_REGISTER_SALES_CHANNEL_MISSING", "Register is missing a POS sales channel", 422, { register_id: register.id })
  if (!String(register.stock_location_id || "").trim()) throw new PosError("POS_REGISTER_LOCATION_MISSING", "Register is missing a stock location", 422, { register_id: register.id })
  if (!String(register.currency_code || "").trim()) throw new PosError("POS_REGISTER_CURRENCY_MISSING", "Register is missing a currency context", 422, { register_id: register.id })
  try {
    const locationService = req.scope.resolve(Modules.STOCK_LOCATION) as { retrieveStockLocation(id: string): Promise<{ name?: string }> }
    const location = await locationService.retrieveStockLocation(String(register.stock_location_id))
    register.stock_location_name = location?.name || ""
  } catch {
    register.stock_location_name = ""
  }
  return register
}

export async function listRegisterVariants(req: MedusaRequest, register: PosRecord): Promise<GraphVariant[]> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as { graph(input: Record<string, unknown>): Promise<{ data: GraphVariant[] }> }
  const { data } = await query.graph({ entity: "variant", fields: ["id","title","sku","barcode","upc","ean","allow_backorder","prices.amount","prices.currency_code","product.id","product.title","product.handle","product.thumbnail","product.status","product.metadata","product.sales_channels.id","product.vendor.id","product.vendor.name","inventory_items.inventory_item_id","inventory_items.inventory.location_levels.location_id","inventory_items.inventory.location_levels.stocked_quantity","inventory_items.inventory.location_levels.reserved_quantity"], pagination: { take: 10000 } })
  return data || []
}

export function mapPosVariant(variant: GraphVariant, register: PosRecord, { throwOnOutOfStock = true }: { throwOnOutOfStock?: boolean } = {}) {
  const productType = String(variant.product?.metadata?.product_type || "standard").toLowerCase()
  if (productType === "personalized") throw new PosError("POS_UNSUPPORTED_PRODUCT_TYPE", "Personalized products must be purchased through the storefront", 422)
  if (productType === "bundle") throw new PosError("POS_UNSUPPORTED_PRODUCT_TYPE", "Fixed bundles are not enabled for POS component inventory", 422)
  if (variant.product?.metadata?.subscription_only === true || variant.product?.metadata?.is_subscription === true) throw new PosError("POS_UNSUPPORTED_PRODUCT_TYPE", "Subscription products must be purchased through the storefront", 422)
  const currency = String(register.currency_code).toLowerCase()
  const price = variant.prices?.find((entry) => entry.currency_code?.toLowerCase() === currency)
  if (!price) {
    throw new PosError("POS_PRICE_UNAVAILABLE", `No valid ${currency.toUpperCase()} price is available`, 422)
  }
  if (!Number.isFinite(Number(price.amount)) || Number(price.amount) <= 0) throw new PosError("POS_PRICE_UNAVAILABLE", `No valid ${currency.toUpperCase()} price is available`, 422)
  
  const levels = (variant.inventory_items || []).flatMap((entry) => entry.inventory?.location_levels || []).filter((level) => level.location_id === register.stock_location_id)
  const inventoryItemId = (variant.inventory_items || []).find((entry) => entry.inventory?.location_levels?.some((level) => level.location_id === register.stock_location_id))?.inventory_item_id
  
  if (!levels.length || !inventoryItemId) {
    throw new PosError("POS_INVENTORY_UNKNOWN", "Inventory could not be verified for this location.", 422, { location_id: register.stock_location_id })
  }
  
  const stocked = levels.reduce((sum, level) => sum + Number(level.stocked_quantity || 0), 0)
  const reserved = levels.reduce((sum, level) => sum + Number(level.reserved_quantity || 0), 0)
  const available = Math.max(0, stocked - reserved)
  const amountMinor = nativeAmountToMinor(price.amount, currency, "variant price")
  const inventoryStatus = available <= 0 ? "OUT_OF_STOCK" : available <= 5 ? "LOW_STOCK" : "AVAILABLE"
  
  if (available <= 0 && variant.allow_backorder !== true) {
    if (throwOnOutOfStock) {
      throw new PosError("POS_OUT_OF_STOCK", "This product is out of stock at this POS location.", 422, { available_quantity: available, location_id: register.stock_location_id })
    }
  }
  
  const pricePayload = { amount: Number(price.amount), amount_minor: amountMinor, amount_native: Number(price.amount), currency_code: currency, formatted: new Intl.NumberFormat(currency === "cad" ? "en-CA" : "en-US", { style: "currency", currency: currency.toUpperCase() }).format(amountMinor / 100) }
  const inventoryPayload = { stock_location_id: register.stock_location_id, location_id: register.stock_location_id, location_name: String(register.stock_location_name || ""), stocked_quantity: stocked, reserved_quantity: reserved, available_quantity: available, status: inventoryStatus }
  
  return {
    product_id: variant.product?.id,
    product_title: variant.product?.title,
    product_handle: variant.product?.handle,
    thumbnail: variant.product?.thumbnail,
    product_thumbnail: variant.product?.thumbnail,
    vendor_id: variant.product?.vendor?.id || variant.product?.metadata?.vendor_id || "PLATFORM",
    vendor_name: variant.product?.vendor?.name || "",
    variant_id: variant.id,
    variant_title: variant.title,
    sku: variant.sku || "",
    barcode: variant.barcode || "",
    upc: variant.upc || "",
    ean: variant.ean || "",
    pos_qr_payload: buildPosVariantQrPayload(variant.id),
    inventory_item_id: inventoryItemId,
    price: pricePayload,
    pricing: pricePayload,
    inventory: inventoryPayload,
    commercial_context: { sales_channel_id: register.sales_channel_id },
    product: { id: variant.product?.id, title: variant.product?.title, thumbnail: variant.product?.thumbnail },
    variant: { id: variant.id, title: variant.title, sku: variant.sku || "", barcode: variant.barcode || "", ean: variant.ean || "", upc: variant.upc || "" },
    register: { id: register.id, name: String(register.name || ""), region_id: register.region_id, currency_code: currency, stock_location_id: register.stock_location_id, sales_channel_id: register.sales_channel_id },
    allow_backorder: variant.allow_backorder === true,
    available_for_sale: available > 0 || variant.allow_backorder === true
  }
}

export function assertVariantInRegisterChannel(variant: GraphVariant, register: PosRecord): void {
  const salesChannelMatch = Boolean(variant.product?.sales_channels?.some((channel) => channel.id === register.sales_channel_id))
  if (!salesChannelMatch) {
    throw new PosError("POS_VARIANT_NOT_IN_SALES_CHANNEL", "Product is not available in this POS location.", 422)
  }
}

export function normalizePosLookupCode(value: unknown): string {
  const code = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim()
  if (!code) throw new PosError("POS_VALIDATION_ERROR", "code is required", 400)
  if (code.length > 128) throw new PosError("POS_VALIDATION_ERROR", "code must be at most 128 characters", 400)
  if (!/^[\x20-\x7e]+$/.test(code)) throw new PosError("POS_VALIDATION_ERROR", "code contains unsupported characters", 400)
  return code
}

export async function resolvePosVariant(req: MedusaRequest, register: PosRecord, code: string, options?: { throwOnOutOfStock?: boolean }) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER) as any
  const variants = await listRegisterVariants(req, register)
  const normalized = normalizePosLookupCode(code)
  const qrVariantId = parsePosVariantQrPayload(normalized)
  
  let foundVariant: GraphVariant | undefined
  let matchedBy: string = ""
  
  if (qrVariantId) {
    foundVariant = variants.find((variant) => variant.id === qrVariantId)
    matchedBy = "QR"
  } else {
    const priorities: Array<keyof Pick<GraphVariant, "barcode" | "upc" | "ean" | "sku">> = ["barcode", "ean", "upc", "sku"]
    for (const field of priorities) {
      foundVariant = variants.find((variant) => String(variant[field] || "") === normalized)
      if (foundVariant) {
        matchedBy = field.toUpperCase()
        break
      }
    }
  }

  if (!foundVariant) {
    logger.info(`[POS_SCANNER_INVENTORY_DIAGNOSTIC] ${JSON.stringify({
      register_id: register.id,
      stock_location_id: register.stock_location_id,
      sales_channel_id: register.sales_channel_id,
      input_code: code,
      variant_id: null,
      inventory_item_id: null,
      stocked_quantity: 0,
      reserved_quantity: 0,
      available_quantity: 0,
      inventory_resolved: false,
      sales_channel_match: false,
      sellable: false,
      reject_reason: "POS_PRODUCT_NOT_FOUND"
    })}`)
    throw new PosError("POS_PRODUCT_NOT_FOUND", "No matching product found.", 404)
  }

  // Check sales channel match
  const salesChannelMatch = Boolean(foundVariant.product?.sales_channels?.some((channel) => channel.id === register.sales_channel_id))

  // Check status
  if (foundVariant.product?.status !== "published") {
    logger.info(`[POS_SCANNER_INVENTORY_DIAGNOSTIC] ${JSON.stringify({
      register_id: register.id,
      stock_location_id: register.stock_location_id,
      sales_channel_id: register.sales_channel_id,
      input_code: code,
      variant_id: foundVariant.id,
      inventory_item_id: null,
      stocked_quantity: 0,
      reserved_quantity: 0,
      available_quantity: 0,
      inventory_resolved: false,
      sales_channel_match: salesChannelMatch,
      sellable: false,
      reject_reason: "POS_PRODUCT_NOT_IN_CHANNEL"
    })}`)
    throw new PosError("POS_PRODUCT_NOT_IN_CHANNEL", "Product is not eligible for POS sale", 422)
  }

  if (!salesChannelMatch) {
    logger.info(`[POS_SCANNER_INVENTORY_DIAGNOSTIC] ${JSON.stringify({
      register_id: register.id,
      stock_location_id: register.stock_location_id,
      sales_channel_id: register.sales_channel_id,
      input_code: code,
      variant_id: foundVariant.id,
      inventory_item_id: null,
      stocked_quantity: 0,
      reserved_quantity: 0,
      available_quantity: 0,
      inventory_resolved: false,
      sales_channel_match: false,
      sellable: false,
      reject_reason: "POS_VARIANT_NOT_IN_SALES_CHANNEL"
    })}`)
    assertVariantInRegisterChannel(foundVariant, register)
  }

  // Resolve inventory fields
  const levels = (foundVariant.inventory_items || []).flatMap((entry) => entry.inventory?.location_levels || []).filter((level) => level.location_id === register.stock_location_id)
  const inventoryItemId = (foundVariant.inventory_items || []).find((entry) => entry.inventory?.location_levels?.some((level) => level.location_id === register.stock_location_id))?.inventory_item_id

  const inventoryResolved = Boolean(inventoryItemId && levels.length)
  const stocked = levels.reduce((sum, level) => sum + Number(level.stocked_quantity || 0), 0)
  const reserved = levels.reduce((sum, level) => sum + Number(level.reserved_quantity || 0), 0)
  const available = Math.max(0, stocked - reserved)
  const sellable = available > 0 || foundVariant.allow_backorder === true

  if (!inventoryResolved) {
    logger.info(`[POS_SCANNER_INVENTORY_DIAGNOSTIC] ${JSON.stringify({
      register_id: register.id,
      stock_location_id: register.stock_location_id,
      sales_channel_id: register.sales_channel_id,
      input_code: code,
      variant_id: foundVariant.id,
      inventory_item_id: null,
      stocked_quantity: 0,
      reserved_quantity: 0,
      available_quantity: 0,
      inventory_resolved: false,
      sales_channel_match: true,
      sellable: false,
      reject_reason: "POS_INVENTORY_UNKNOWN"
    })}`)
    throw new PosError("POS_INVENTORY_UNKNOWN", "Inventory could not be verified for this location.", 422, { location_id: register.stock_location_id })
  }

  if (available <= 0 && foundVariant.allow_backorder !== true && options?.throwOnOutOfStock !== false) {
    logger.info(`[POS_SCANNER_INVENTORY_DIAGNOSTIC] ${JSON.stringify({
      register_id: register.id,
      stock_location_id: register.stock_location_id,
      sales_channel_id: register.sales_channel_id,
      input_code: code,
      variant_id: foundVariant.id,
      inventory_item_id: inventoryItemId,
      stocked_quantity: stocked,
      reserved_quantity: reserved,
      available_quantity: available,
      inventory_resolved: true,
      sales_channel_match: true,
      sellable: false,
      reject_reason: "POS_OUT_OF_STOCK"
    })}`)
    throw new PosError("POS_OUT_OF_STOCK", "This product is out of stock at this POS location.", 422, { available_quantity: available, location_id: register.stock_location_id })
  }

  // Success path
  try {
    const product = mapPosVariant(foundVariant, register, options)
    
    logger.info(`[POS_SCANNER_VARIANT_MATCH] ${JSON.stringify({
      input_code: code,
      product_id: product.product_id,
      variant_id: product.variant_id,
      sku: product.sku,
      barcode: product.barcode,
      ean: product.ean,
      upc: product.upc,
      matched_by: matchedBy
    })}`)

    return product
  } catch (error: any) {
    logger.info(`[POS_SCANNER_INVENTORY_DIAGNOSTIC] ${JSON.stringify({
      register_id: register.id,
      stock_location_id: register.stock_location_id,
      sales_channel_id: register.sales_channel_id,
      input_code: code,
      variant_id: foundVariant.id,
      inventory_item_id: inventoryItemId,
      stocked_quantity: stocked,
      reserved_quantity: reserved,
      available_quantity: available,
      inventory_resolved: inventoryResolved,
      sales_channel_match: true,
      sellable: sellable,
      reject_reason: error.code || error.message || "MAP_ERROR"
    })}`)
    throw error
  }
}
