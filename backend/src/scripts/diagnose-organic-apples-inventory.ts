import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const APPLES_PRODUCT_ID = "prod_01KVSFB71XDNGFJN01RH3C2G1M"
const APPLES_VARIANT_ID = "variant_01KVSFB75GZJ4N0B9SY6BXDTZC"
const TARGET_TITLES = ["Organic Apples", "chocolate", "Organic OIL"]

function available(level: any) {
  const stocked = Number(level?.stocked_quantity ?? 0)
  const reserved = Number(level?.reserved_quantity ?? 0)
  return Number.isFinite(stocked) && Number.isFinite(reserved) ? stocked - reserved : null
}

function classify(variant: any, levels: any[]) {
  if (!variant?.inventory_items?.length) return "NO_INVENTORY_ITEM_LINK"
  if (!levels.length) return "NO_INVENTORY_LEVEL"
  if (levels.every((level) => available(level) === 0)) return "ZERO_AVAILABLE_QUANTITY"
  if (levels.every((level) => (available(level) ?? 0) < 0)) return "FULLY_RESERVED"
  return "AVAILABLE_OR_SERVICEABILITY_REQUIRES_CART_CONTEXT"
}

export default async function diagnoseOrganicApplesInventory({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query: any = container.resolve(ContainerRegistrationKeys.QUERY)
  const inventory: any = container.resolve(Modules.INVENTORY)
  const stockLocations: any = container.resolve(Modules.STOCK_LOCATION)

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id", "title", "handle", "status", "deleted_at", "created_at", "updated_at",
      "sales_channels.id", "sales_channels.name", "shipping_profile_id",
      "variants.id", "variants.title", "variants.sku", "variants.manage_inventory", "variants.allow_backorder",
      "variants.inventory_items.inventory_item_id", "variants.inventory_items.required_quantity",
    ],
    filters: { id: [APPLES_PRODUCT_ID] },
  })
  const apples = products?.[0]
  const applesVariant = apples?.variants?.find((variant: any) => variant.id === APPLES_VARIANT_ID)
  if (!apples || !applesVariant) throw new Error("Organic Apples product or variant was not found")

  const { data: comparableProducts } = await query.graph({
    entity: "product",
    fields: [
      "id", "title", "handle", "sales_channels.id", "variants.id", "variants.title", "variants.sku",
      "variants.manage_inventory", "variants.allow_backorder", "variants.inventory_items.inventory_item_id",
    ],
  })
  const comparisonProducts = TARGET_TITLES.map((title) =>
    comparableProducts.find((product: any) => product.title?.toLowerCase() === title.toLowerCase())
  ).filter(Boolean)

  const allLocations = await stockLocations.listStockLocations({})
  const inspectVariant = async (product: any, variant: any) => {
    const links = Array.isArray(variant?.inventory_items) ? variant.inventory_items : []
    const itemIds = links.map((link: any) => link.inventory_item_id).filter(Boolean)
    const itemDetails = await Promise.all(itemIds.map(async (id: string) => {
      const item = await inventory.retrieveInventoryItem(id)
      const levels = await inventory.listInventoryLevels({ inventory_item_id: id })
      return { id, sku: item?.sku ?? null, levels }
    }))
    const levels = itemDetails.flatMap((item: any) => item.levels.map((level: any) => ({ ...level, inventory_item_id: item.id })))
    return {
      productId: product.id,
      productTitle: product.title,
      variantId: variant.id,
      variantTitle: variant.title,
      manageInventory: variant.manage_inventory,
      allowBackorder: variant.allow_backorder,
      inventoryItemLinks: links,
      inventoryItemIds: itemIds,
      inventoryItemSku: itemDetails.map((item: any) => item.sku),
      inventoryLevels: levels.map((level: any) => ({
        id: level.id,
        inventoryItemId: level.inventory_item_id,
        stockLocationId: level.location_id,
        stockedQuantity: level.stocked_quantity,
        reservedQuantity: level.reserved_quantity,
        availableQuantity: available(level),
        incomingQuantity: level.incoming_quantity ?? null,
      })),
      classification: classify(variant, levels),
    }
  }

  const inspected = [] as any[]
  for (const product of comparisonProducts) {
    const variant = product.variants?.find((item: any) => item.id === APPLES_VARIANT_ID) || product.variants?.[0]
    if (variant) inspected.push(await inspectVariant(product, variant))
  }
  const applesInventory = inspected.find((item) => item.variantId === APPLES_VARIANT_ID)
  const locationDetails = allLocations.map((location: any) => ({ id: location.id, name: location.name, deletedAt: location.deleted_at ?? null }))

  logger.info("[ORGANIC_APPLES_INVENTORY_DIAGNOSIS]")
  logger.info(JSON.stringify({
    productId: apples.id,
    variantId: applesVariant.id,
    salesChannel: apples.sales_channels ?? [],
    shippingProfile: apples.shipping_profile_id ?? null,
    deletedAt: apples.deleted_at ?? null,
    createdAt: apples.created_at ?? null,
    updatedAt: apples.updated_at ?? null,
    stockLocations: locationDetails,
    comparison: inspected,
    organicApples: applesInventory,
    inventoryWrites: 0,
  }, null, 2))
}
