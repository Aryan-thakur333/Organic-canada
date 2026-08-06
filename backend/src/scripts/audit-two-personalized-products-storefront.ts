import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, QueryContext } from "@medusajs/framework/utils"
import { PERSONALIZATION_MODULE } from "../modules/personalization"

const TARGETS = [
  {
    productId: "prod_01KVSFB87RKDRSY8HR988M0Z9K",
    expectedVariantId: null,
    expectedTemplateTitle: "Personal Product",
  },
  {
    productId: "prod_01KVSFB8GJWSH1JMXG0XPG2F6N",
    expectedVariantId: "variant_01KVSFB8HDHXQHA4PKSS9PQ89A",
    expectedTemplateTitle: "Personalize Product",
  },
] as const

const USA_REGION_ID = "reg_01KXT623CTGM9NJJYK2G4DQW7E"
const CANADA_REGION_ID = "reg_01KVJF9HSCYKAZC677GH1AC6C8"
const FRONTEND_PUBLISHABLE_TOKEN = "pk_7c77314f27ecee7ec1cd570d5dafe23b5622981632dc5d6f2aa81531045b2491"
const SUPPORTED_FIELD_TYPES = new Set([
  "text", "textarea", "number", "date", "select", "radio", "checkbox",
  "boolean", "color", "image_upload",
])

const numberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const calculatedAmount = (variant: any) => numberOrNull(
  variant?.calculated_price?.calculated_amount ?? variant?.calculated_price?.amount
)

const fieldIsValid = (field: any) => {
  const fieldType = String(field?.field_type || "")
  const adjustment = numberOrNull(field?.price_adjustment)
  const optionsValid = !["select", "radio"].includes(fieldType)
    || (Array.isArray(field?.allowed_values)
      && field.allowed_values.length > 0
      && field.allowed_values.every((value: unknown) => String(value || "").trim().length > 0))
  return Boolean(
    String(field?.key || "").trim()
    && String(field?.label || "").trim()
    && SUPPORTED_FIELD_TYPES.has(fieldType)
    && optionsValid
    && adjustment !== null
    && adjustment >= 0
  )
}

export default async function auditTwoPersonalizedProductsStorefront({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query: any = container.resolve(ContainerRegistrationKeys.QUERY)
  const inventoryService: any = container.resolve(Modules.INVENTORY)
  const personalizationService: any = container.resolve(PERSONALIZATION_MODULE)
  const productIds = TARGETS.map((target) => target.productId)

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id", "title", "handle", "status", "deleted_at", "created_at", "updated_at",
      "thumbnail", "metadata", "type.id", "type.value", "images.id", "images.url",
      "categories.id", "categories.name", "categories.handle", "collection.id", "collection.title",
      "sales_channels.id", "sales_channels.name", "variants.id", "variants.title", "variants.sku",
      "variants.manage_inventory", "variants.allow_backorder", "variants.inventory_quantity",
      "variants.prices.id", "variants.prices.amount", "variants.prices.currency_code",
      "variants.prices.price_set_id", "variants.inventory_items.inventory_item_id",
      "variants.inventory_items.required_quantity",
    ],
    filters: { id: productIds },
  })
  const productById = new Map((products || []).map((product: any) => [product.id, product]))

  const recordProducts = TARGETS.map((target) => {
    const product: any = productById.get(target.productId)
    return {
      productId: target.productId,
      exists: Boolean(product),
      title: product?.title || "",
      handle: product?.handle || "",
      status: product?.status || "",
      deleted_at: product?.deleted_at || null,
      created_at: product?.created_at || null,
      updated_at: product?.updated_at || null,
      deleted: Boolean(product?.deleted_at),
      variantIds: (product?.variants || []).map((variant: any) => variant.id),
      thumbnail: product?.thumbnail || null,
      images: (product?.images || []).map((image: any) => ({ id: image.id, url: image.url })),
      metadata: product?.metadata || {},
      productType: product?.type ? { id: product.type.id, value: product.type.value } : null,
      categories: (product?.categories || []).map((category: any) => ({ id: category.id, name: category.name, handle: category.handle })),
      collections: product?.collection ? [{ id: product.collection.id, title: product.collection.title }] : [],
      passed: Boolean(product && product.status === "published" && !product.deleted_at && product.variants?.length),
    }
  })
  logger.info("[PERSONALIZED_PRODUCTS_RECORD_AUDIT]")
  logger.info(JSON.stringify({ products: recordProducts }, null, 2))

  const { data: keys } = await query.graph({
    entity: "api_key",
    fields: ["id", "title", "token", "type", "sales_channels.id", "sales_channels.name"],
    filters: { type: "publishable" },
  })
  const publishableKey = (keys || []).find((key: any) => key.token === FRONTEND_PUBLISHABLE_TOKEN) || null
  const storefrontChannelIds = (publishableKey?.sales_channels || []).map((channel: any) => channel.id)
  const channelProducts = TARGETS.map((target) => {
    const product: any = productById.get(target.productId)
    const assignedSalesChannelIds = (product?.sales_channels || []).map((channel: any) => channel.id)
    const intersection = assignedSalesChannelIds.filter((id: string) => storefrontChannelIds.includes(id))
    return {
      productId: target.productId,
      assignedSalesChannelIds,
      storefrontIntersection: intersection,
      assignedToUsaStorefront: intersection.length > 0,
    }
  })
  logger.info("[PERSONALIZED_PRODUCTS_CHANNEL_AUDIT]")
  logger.info(JSON.stringify({
    publishableKeyId: publishableKey?.id || null,
    storefrontSalesChannelIds: storefrontChannelIds,
    products: channelProducts,
    passed: Boolean(publishableKey && storefrontChannelIds.length && channelProducts.every((product) => product.assignedToUsaStorefront)),
  }, null, 2))

  const variantIds = (products || []).flatMap((product: any) => (product.variants || []).map((variant: any) => variant.id))
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
  const usaCalculatedById = new Map(usaCalculated.map((variant: any) => [variant.id, variant]))
  const canadaCalculatedById = new Map(canadaCalculated.map((variant: any) => [variant.id, variant]))
  const priceProducts = TARGETS.map((target) => {
    const product: any = productById.get(target.productId)
    return {
      productId: target.productId,
      variants: (product?.variants || []).map((variant: any) => {
        const usdRaw = (variant.prices || []).find((price: any) => String(price.currency_code).toLowerCase() === "usd")
        const cadRaw = (variant.prices || []).find((price: any) => String(price.currency_code).toLowerCase() === "cad")
        const usaVariant: any = usaCalculatedById.get(variant.id)
        const canadaVariant: any = canadaCalculatedById.get(variant.id)
        const usdCalculatedAmount = calculatedAmount(usaVariant)
        return {
          variantId: variant.id,
          priceSetId: usdRaw?.price_set_id || cadRaw?.price_set_id || null,
          usdRawAmount: numberOrNull(usdRaw?.amount),
          cadRawAmount: numberOrNull(cadRaw?.amount),
          usdCalculatedAmount,
          calculatedCurrency: usaVariant?.calculated_price?.currency_code || null,
          cadCalculatedAmount: calculatedAmount(canadaVariant),
          calculationContext: { region_id: USA_REGION_ID, currency_code: "usd" },
          eligible: Boolean(usdCalculatedAmount !== null && usdCalculatedAmount > 0 && usaVariant?.calculated_price?.currency_code === "usd"),
          missingPriceReason: usdCalculatedAmount === null ? (usdRaw ? "USD_PRICE_NOT_CALCULABLE" : "RAW_USD_PRICE_MISSING") : null,
        }
      }),
    }
  })
  logger.info("[PERSONALIZED_PRODUCTS_PRICE_AUDIT]")
  logger.info(JSON.stringify({
    usaRegionId: USA_REGION_ID,
    currencyCode: "usd",
    products: priceProducts,
    passed: Boolean(priceProducts.length && priceProducts.every((product) => product.variants.length && product.variants.every((variant) => variant.eligible))),
  }, null, 2))

  const { data: locations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name", "address.country_code", "sales_channels.id"],
  })
  const locationById = new Map((locations || []).map((location: any) => [location.id, location]))
  const inventoryProducts: any[] = []
  for (const target of TARGETS) {
    const product: any = productById.get(target.productId)
    const variantAudits: any[] = []
    for (const variant of product?.variants || []) {
      const links = variant.inventory_items || []
      if (variant.manage_inventory === false || variant.allow_backorder) {
        variantAudits.push({
          variantId: variant.id,
          inventoryItemId: links[0]?.inventory_item_id || null,
          stockLocationId: null,
          manageInventory: Boolean(variant.manage_inventory),
          allowBackorder: Boolean(variant.allow_backorder),
          stocked: null,
          reserved: null,
          available: null,
          sellable: true,
          reason: variant.allow_backorder ? "ALLOW_BACKORDER" : "INVENTORY_NOT_MANAGED",
        })
        continue
      }
      for (const link of links) {
        const levels = await inventoryService.listInventoryLevels({ inventory_item_id: link.inventory_item_id })
        const usaLevels = levels.filter((level: any) => {
          const location: any = locationById.get(level.location_id)
          return String(location?.address?.country_code || "").toLowerCase() === "us"
            && (location.sales_channels || []).some((channel: any) => storefrontChannelIds.includes(channel.id))
        })
        if (!usaLevels.length) {
          variantAudits.push({
            variantId: variant.id,
            inventoryItemId: link.inventory_item_id,
            stockLocationId: null,
            manageInventory: true,
            allowBackorder: false,
            stocked: 0,
            reserved: 0,
            available: 0,
            sellable: false,
            reason: "NO_USA_STOREFRONT_INVENTORY_LEVEL",
          })
        }
        for (const level of usaLevels) {
          const stocked = numberOrNull(level.stocked_quantity) || 0
          const reserved = numberOrNull(level.reserved_quantity) || 0
          const available = numberOrNull(level.available_quantity) ?? stocked - reserved
          const required = Number(link.required_quantity || 1)
          variantAudits.push({
            variantId: variant.id,
            inventoryItemId: link.inventory_item_id,
            stockLocationId: level.location_id,
            stockLocationName: (locationById.get(level.location_id) as any)?.name || null,
            manageInventory: true,
            allowBackorder: false,
            stocked,
            reserved,
            available,
            requiredQuantity: required,
            sellable: available >= required,
            reason: available >= required ? "AVAILABLE" : "OUT_OF_STOCK",
          })
        }
      }
      if (!links.length) {
        variantAudits.push({
          variantId: variant.id,
          inventoryItemId: null,
          stockLocationId: null,
          manageInventory: true,
          allowBackorder: false,
          stocked: 0,
          reserved: 0,
          available: 0,
          sellable: false,
          reason: "NO_INVENTORY_ITEM_LINK",
        })
      }
    }
    inventoryProducts.push({ productId: target.productId, variants: variantAudits })
  }
  logger.info("[PERSONALIZED_PRODUCTS_INVENTORY_AUDIT]")
  logger.info(JSON.stringify({
    products: inventoryProducts,
    passed: Boolean(inventoryProducts.length && inventoryProducts.every((product) => product.variants.length && product.variants.every((variant: any) => variant.sellable))),
  }, null, 2))

  const templateAudits: any[] = []
  for (const target of TARGETS) {
    const templates = await personalizationService.listTemplatesWithFields({ product_id: target.productId }, { order: { created_at: "DESC" } })
    const activeTemplates = (templates || []).filter((candidate: any) => candidate.is_active && !candidate.deleted_at)
    const template = activeTemplates.find((candidate: any) => candidate.title === target.expectedTemplateTitle)
      || activeTemplates[0]
      || null
    const product: any = productById.get(target.productId)
    const variantLinkFound = target.expectedVariantId === null
      ? template?.variant_id == null
      : Boolean(template?.variant_id === target.expectedVariantId && (product?.variants || []).some((variant: any) => variant.id === target.expectedVariantId))
    templateAudits.push({
      templateId: template?.id || null,
      title: template?.title || null,
      expectedTitle: target.expectedTemplateTitle,
      expectedTitleMatches: template?.title === target.expectedTemplateTitle,
      productId: target.productId,
      variantId: template?.variant_id || null,
      active: Boolean(template?.is_active && !template?.deleted_at),
      productLinkFound: Boolean(product && template?.product_id === target.productId),
      variantLinkFound,
      fieldCount: template?.fields?.length || 0,
      fields: (template?.fields || []).map((field: any) => ({
        id: field.id,
        key: field.key,
        label: field.label,
        fieldType: field.field_type,
        allowedValues: field.allowed_values,
        priceAdjustment: numberOrNull(field.price_adjustment),
        valid: fieldIsValid(field),
      })),
      fieldsValid: Boolean(template?.fields?.length && template.fields.every(fieldIsValid)),
      candidates: (templates || []).map((candidate: any) => ({
        id: candidate.id,
        title: candidate.title,
        productId: candidate.product_id,
        variantId: candidate.variant_id || null,
        active: Boolean(candidate.is_active),
        deletedAt: candidate.deleted_at || null,
        fieldCount: candidate.fields?.length || 0,
      })),
    })
  }
  logger.info("[PERSONALIZATION_TEMPLATE_ELIGIBILITY_AUDIT]")
  logger.info(JSON.stringify({
    templates: templateAudits,
    passed: templateAudits.every((template) => template.active && template.expectedTitleMatches && template.productLinkFound && template.variantLinkFound && template.fieldsValid),
  }, null, 2))

  logger.info("[TWO_PERSONALIZED_PRODUCTS_DATA_AUDIT_SUMMARY]")
  logger.info(JSON.stringify({
    productRecordsPassed: recordProducts.every((product) => product.passed),
    salesChannelsPassed: channelProducts.every((product) => product.assignedToUsaStorefront),
    usaPricesPassed: priceProducts.every((product) => product.variants.length && product.variants.every((variant) => variant.eligible)),
    inventoryPassed: inventoryProducts.every((product) => product.variants.length && product.variants.every((variant: any) => variant.sellable)),
    templatesPassed: templateAudits.every((template) => template.active && template.expectedTitleMatches && template.productLinkFound && template.variantLinkFound && template.fieldsValid),
    databaseWrites: 0,
  }, null, 2))
}
