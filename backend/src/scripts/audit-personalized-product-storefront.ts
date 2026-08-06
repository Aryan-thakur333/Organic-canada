import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, QueryContext } from "@medusajs/framework/utils"
import { PERSONALIZATION_MODULE } from "../modules/personalization"

const PRODUCT_ID = "prod_01KVSFB87RKDRSY8HR988M0Z9K"
const USA_REGION_ID = "reg_01KXT623CTGM9NJJYK2G4DQW7E"
const CANADA_REGION_ID = "reg_01KVJF9HSCYKAZC677GH1AC6C8"
const STOREFRONT_SALES_CHANNEL_ID = "sc_01KVJF9HK0YY92JES8P7VPZN12"

const numberOrNull = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const calculatedAmount = (variant: any) => {
  const value = variant?.calculated_price?.calculated_amount ?? variant?.calculated_price?.amount
  return numberOrNull(value)
}

export default async function auditPersonalizedProductStorefront({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query: any = container.resolve(ContainerRegistrationKeys.QUERY)
  const inventoryService: any = container.resolve(Modules.INVENTORY)
  const personalizationService: any = container.resolve(PERSONALIZATION_MODULE)

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id", "title", "status", "handle", "deleted_at", "thumbnail", "metadata",
      "images.id", "images.url", "categories.id", "categories.name",
      "collection.id", "collection.title", "sales_channels.id", "sales_channels.name",
      "variants.id", "variants.title", "variants.sku", "variants.manage_inventory",
      "variants.allow_backorder", "variants.inventory_quantity",
      "variants.prices.id", "variants.prices.amount", "variants.prices.currency_code",
      "variants.prices.price_set_id", "variants.inventory_items.inventory_item_id",
      "variants.inventory_items.required_quantity",
    ],
    filters: { id: PRODUCT_ID },
  })
  const product = products?.[0] || null
  const templates = product
    ? await personalizationService.listTemplatesWithFields({ product_id: PRODUCT_ID }, { order: { created_at: "DESC" } })
    : []
  const activeTemplate = templates.find((template: any) => template.is_active) || null

  logger.info("[PERSONALIZED_PRODUCT_RECORD_AUDIT]")
  logger.info(JSON.stringify({
    productId: PRODUCT_ID,
    exists: Boolean(product),
    title: product?.title || "",
    status: product?.status || "",
    handle: product?.handle || "",
    deleted: Boolean(product?.deleted_at),
    variantCount: product?.variants?.length || 0,
    thumbnail: product?.thumbnail || null,
    imageCount: product?.images?.length || 0,
    categories: (product?.categories || []).map((category: any) => ({ id: category.id, name: category.name })),
    collection: product?.collection ? { id: product.collection.id, title: product.collection.title } : null,
    metadata: product?.metadata || {},
    templateId: activeTemplate?.id || null,
    templateTitle: activeTemplate?.title || null,
    templateVariantId: activeTemplate?.variant_id || null,
    templateFieldCount: activeTemplate?.fields?.length || 0,
    templateActive: Boolean(activeTemplate),
    passed: Boolean(product && product.status === "published" && !product.deleted_at && product.variants?.length && activeTemplate),
  }, null, 2))

  let publishableChannels: any[] = []
  let publishableKeyId: string | null = null
  try {
    const { data: keys } = await query.graph({
      entity: "api_key",
      fields: ["id", "title", "token", "type", "sales_channels.id", "sales_channels.name"],
      filters: { type: "publishable" },
    })
    const key = (keys || []).find((candidate: any) => candidate.title === "Default Publishable API Key") || keys?.[0]
    publishableKeyId = key?.id || null
    publishableChannels = key?.sales_channels || []
  } catch {
    publishableChannels = []
  }
  const productSalesChannels = product?.sales_channels || []
  const effectiveChannelId = publishableChannels[0]?.id || STOREFRONT_SALES_CHANNEL_ID

  logger.info("[PERSONALIZED_PRODUCT_CHANNEL_AUDIT]")
  logger.info(JSON.stringify({
    publishableKeyId,
    publishableKeySalesChannels: publishableChannels.map((channel: any) => channel.id),
    storefrontSalesChannelId: effectiveChannelId,
    productSalesChannelIds: productSalesChannels.map((channel: any) => channel.id),
    assignedToStorefront: productSalesChannels.some((channel: any) => channel.id === effectiveChannelId),
  }, null, 2))

  const variantIds = (product?.variants || []).map((variant: any) => variant.id)
  const loadCalculated = async (regionId: string, currencyCode: string) => {
    if (!variantIds.length) return []
    const { data } = await query.graph({
      entity: "product_variant",
      fields: ["id", "calculated_price.*"],
      filters: { id: variantIds },
      context: { calculated_price: QueryContext({ region_id: regionId, currency_code: currencyCode }) },
    })
    return data || []
  }
  const [usaCalculated, canadaCalculated] = await Promise.all([
    loadCalculated(USA_REGION_ID, "usd"),
    loadCalculated(CANADA_REGION_ID, "cad"),
  ])
  const usaById = new Map(usaCalculated.map((variant: any) => [variant.id, variant]))
  const canadaById = new Map(canadaCalculated.map((variant: any) => [variant.id, variant]))
  const priceAudit = (product?.variants || []).map((variant: any) => ({
    variantId: variant.id,
    priceSetIds: [...new Set((variant.prices || []).map((price: any) => price.price_set_id).filter(Boolean))],
    rawUsdAmounts: (variant.prices || []).filter((price: any) => String(price.currency_code).toLowerCase() === "usd").map((price: any) => numberOrNull(price.amount)),
    rawCadAmounts: (variant.prices || []).filter((price: any) => String(price.currency_code).toLowerCase() === "cad").map((price: any) => numberOrNull(price.amount)),
    usdCalculatedAmount: calculatedAmount(usaById.get(variant.id)),
    usdCalculatedCurrency: (usaById.get(variant.id) as any)?.calculated_price?.currency_code || null,
    cadCalculatedAmount: calculatedAmount(canadaById.get(variant.id)),
    cadCalculatedCurrency: (canadaById.get(variant.id) as any)?.calculated_price?.currency_code || null,
  }))
  logger.info("[PERSONALIZED_PRODUCT_PRICE_AUDIT]")
  logger.info(JSON.stringify({
    variants: priceAudit,
    usaPricePassed: priceAudit.length > 0 && priceAudit.every((variant: any) => variant.usdCalculatedAmount > 0 && variant.usdCalculatedCurrency === "usd" && variant.priceSetIds.length > 0),
    canadaPricePassed: priceAudit.length > 0 && priceAudit.every((variant: any) => variant.cadCalculatedAmount > 0 && variant.cadCalculatedCurrency === "cad" && variant.priceSetIds.length > 0),
  }, null, 2))

  const { data: locations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name", "address.country_code", "sales_channels.id"],
  })
  const locationById = new Map((locations || []).map((location: any) => [location.id, location]))
  const inventoryAudit: any[] = []
  for (const variant of product?.variants || []) {
    const links = variant.inventory_items || []
    if (variant.manage_inventory === false || variant.allow_backorder) {
      inventoryAudit.push({
        variantId: variant.id,
        stockLocationId: null,
        stocked: null,
        reserved: null,
        available: null,
        manageInventory: Boolean(variant.manage_inventory),
        allowBackorder: Boolean(variant.allow_backorder),
        sellable: true,
        reason: variant.allow_backorder ? "ALLOW_BACKORDER" : "INVENTORY_NOT_MANAGED",
      })
      continue
    }
    if (!links.length) {
      inventoryAudit.push({ variantId: variant.id, stockLocationId: null, stocked: 0, reserved: 0, available: 0, manageInventory: true, allowBackorder: false, sellable: false, reason: "NO_INVENTORY_ITEM_LINK" })
      continue
    }
    for (const link of links) {
      const levels = await inventoryService.listInventoryLevels({ inventory_item_id: link.inventory_item_id })
      if (!levels.length) inventoryAudit.push({ variantId: variant.id, inventoryItemId: link.inventory_item_id, stockLocationId: null, stocked: 0, reserved: 0, available: 0, manageInventory: true, allowBackorder: false, sellable: false, reason: "NO_INVENTORY_LEVEL" })
      for (const level of levels) {
        const location: any = locationById.get(level.location_id)
        const stocked = numberOrNull(level.stocked_quantity) || 0
        const reserved = numberOrNull(level.reserved_quantity) || 0
        const available = numberOrNull(level.available_quantity) ?? stocked - reserved
        const channelLinked = Boolean(location?.sales_channels?.some((channel: any) => channel.id === effectiveChannelId))
        const countryCode = String(location?.address?.country_code || "").toLowerCase()
        const usaLocation = countryCode === "us" || channelLinked
        inventoryAudit.push({
          variantId: variant.id,
          inventoryItemId: link.inventory_item_id,
          requiredQuantity: link.required_quantity ?? 1,
          stockLocationId: level.location_id,
          stockLocationName: location?.name || null,
          countryCode: countryCode || null,
          salesChannelLinked: channelLinked,
          stocked,
          reserved,
          available,
          manageInventory: true,
          allowBackorder: false,
          sellable: usaLocation && available >= Number(link.required_quantity || 1),
          reason: usaLocation ? (available > 0 ? "AVAILABLE" : "OUT_OF_STOCK") : "NON_USA_LOCATION",
        })
      }
    }
  }
  for (const item of inventoryAudit) {
    logger.info("[PERSONALIZED_PRODUCT_INVENTORY_AUDIT]")
    logger.info(JSON.stringify(item, null, 2))
  }

  logger.info("[PERSONALIZED_PRODUCT_DATA_AUDIT_SUMMARY]")
  logger.info(JSON.stringify({
    productId: PRODUCT_ID,
    productExists: Boolean(product),
    productPublished: product?.status === "published",
    salesChannelAssigned: productSalesChannels.some((channel: any) => channel.id === effectiveChannelId),
    usaPriceAvailable: priceAudit.length > 0 && priceAudit.every((variant: any) => variant.usdCalculatedAmount > 0 && variant.usdCalculatedCurrency === "usd"),
    canadaPriceAvailable: priceAudit.length > 0 && priceAudit.every((variant: any) => variant.cadCalculatedAmount > 0 && variant.cadCalculatedCurrency === "cad"),
    usaInventoryAvailable: variantIds.length > 0 && variantIds.every((variantId: string) => inventoryAudit.some((item) => item.variantId === variantId && item.sellable)),
    templateActive: Boolean(activeTemplate),
    activeTemplateFieldsValid: Boolean(activeTemplate?.fields?.length && activeTemplate.fields.every((field: any) => String(field.label || "").trim())),
    databaseWrites: 0,
  }, null, 2))
}
