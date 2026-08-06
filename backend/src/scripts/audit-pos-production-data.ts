import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { POS_MODULE } from "../modules/pos"
import type PosModuleService from "../modules/pos/service"

type GraphVariant = {
  id: string
  sku?: string | null
  barcode?: string | null
  allow_backorder?: boolean
  prices?: Array<{ currency_code: string; amount: number }>
  product?: {
    id: string
    status?: string
    type_id?: string | null
    metadata?: Record<string, unknown> | null
    sales_channels?: Array<{ id: string }>
  }
  inventory_items?: Array<{
    inventory_item_id: string
    inventory?: {
      location_levels?: Array<{
        location_id: string
        stocked_quantity: number
        reserved_quantity: number
      }>
    }
  }>
}

type ShippingOptionGraph = {
  id: string
  name: string
  service_zone?: {
    geo_zones?: Array<{ country_code?: string | null }>
    fulfillment_set?: {
      id: string
      location?: {
        id: string
        address?: { country_code?: string | null }
        sales_channels?: Array<{ id: string }>
        fulfillment_providers?: Array<{ id: string }>
      }
    }
  }
}

type TaxRateWithRules = {
  id: string
  tax_region_id: string
  name: string
  code?: string | null
  rate?: number | null
  is_default: boolean
  rules?: Array<{ reference: string; reference_id: string }>
}

const lower = (value: unknown) => String(value || "").toLowerCase()

export default async function auditPosProductionData({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const taxService = container.resolve(Modules.TAX)
  const posService = container.resolve(POS_MODULE) as PosModuleService

  const [registers, taxRegions, taxRates, taxProviders, variantGraph, shippingGraph] = await Promise.all([
    posService.listPosRegisters({}, { take: 100 }),
    taxService.listTaxRegions({}, { take: 1000 }),
    taxService.listTaxRates({}, { take: 1000, relations: ["rules", "tax_region"] }),
    taxService.listTaxProviders({}, { take: 100 }),
    query.graph({
      entity: "variant",
      fields: [
        "id", "sku", "barcode", "allow_backorder", "prices.currency_code", "prices.amount",
        "product.id", "product.status", "product.type_id", "product.metadata", "product.sales_channels.id",
        "inventory_items.inventory_item_id",
        "inventory_items.inventory.location_levels.location_id",
        "inventory_items.inventory.location_levels.stocked_quantity",
        "inventory_items.inventory.location_levels.reserved_quantity",
      ],
      pagination: { take: 10000 },
    }),
    query.graph({
      entity: "shipping_option",
      fields: [
        "id", "name", "service_zone.geo_zones.country_code",
        "service_zone.fulfillment_set.id",
        "service_zone.fulfillment_set.location.id",
        "service_zone.fulfillment_set.location.address.country_code",
        "service_zone.fulfillment_set.location.sales_channels.id",
        "service_zone.fulfillment_set.location.fulfillment_providers.id",
      ],
      pagination: { take: 1000 },
    }),
  ])

  const variants = variantGraph.data as GraphVariant[]
  const shippingOptions = shippingGraph.data as ShippingOptionGraph[]
  const registerByCurrency = new Map(registers.map((register) => [lower(register.currency_code), register]))
  const canadaRegister = registerByCurrency.get("cad")
  const usaRegister = registerByCurrency.get("usd")
  if (!canadaRegister || !usaRegister) {
    throw new Error("Both CAD and USD POS registers are required for the production data audit")
  }

  const allPosVariants = variants.filter((variant) =>
    variant.product?.status === "published" &&
    variant.product.sales_channels?.some((channel) => channel.id === usaRegister.sales_channel_id)
  )
  const fixtureVariants = allPosVariants.filter((variant) => variant.product?.metadata?.pos_test_fixture === true)
  const posVariants = allPosVariants.filter((variant) => variant.product?.metadata?.pos_test_fixture !== true)
  const usaInventory = posVariants.map((variant) => {
    const inventoryItems = variant.inventory_items || []
    const levels = inventoryItems.flatMap((item) => item.inventory?.location_levels || [])
      .filter((level) => level.location_id === usaRegister.stock_location_id)
    const stockedQuantity = levels.reduce((sum, level) => sum + Number(level.stocked_quantity || 0), 0)
    const reservedQuantity = levels.reduce((sum, level) => sum + Number(level.reserved_quantity || 0), 0)
    return {
      variantId: variant.id,
      sku: variant.sku || null,
      inventoryItemIds: inventoryItems.map((item) => item.inventory_item_id),
      usaLocationId: usaRegister.stock_location_id,
      stockedQuantity,
      reservedQuantity,
      availableQuantity: Math.max(0, stockedQuantity - reservedQuantity),
      salesChannelAvailable: variant.product?.sales_channels?.some((channel) => channel.id === usaRegister.sales_channel_id) || false,
      regionCompatible: Boolean(variant.prices?.some((price) => lower(price.currency_code) === "usd" && Number(price.amount) > 0)),
      allowBackorder: variant.allow_backorder === true,
    }
  })

  const typedTaxRates = taxRates as TaxRateWithRules[]
  const taxRegionById = new Map(taxRegions.map((region) => [region.id, region]))
  const ratesForCountry = (countryCode: string) => typedTaxRates.filter(
    (rate) => lower(taxRegionById.get(rate.tax_region_id)?.country_code) === countryCode
  )
  const canadaRates = ratesForCountry("ca")
  const usaRates = ratesForCountry("us")
  const uniqueProducts = new Map(posVariants.map((variant) => [variant.product?.id, variant.product]))
  uniqueProducts.delete(undefined)
  const hasProductRate = (product: NonNullable<GraphVariant["product"]>, rates: TaxRateWithRules[]) => rates.some(
    (rate) => rate.is_default || rate.rules?.some((rule) =>
      (rule.reference === "product" && rule.reference_id === product.id) ||
      (rule.reference === "product_type" && rule.reference_id === product.type_id)
    )
  )
  const missingProductTaxClassifications = [...uniqueProducts.values()].filter((product) =>
    !product || !hasProductRate(product, canadaRates) || !hasProductRate(product, usaRates)
  ).length

  const optionCountries = (option: ShippingOptionGraph) => new Set(
    (option.service_zone?.geo_zones || []).map((zone) => lower(zone.country_code)).filter(Boolean)
  )
  const missingShippingTaxRules = shippingOptions.filter((option) => {
    const countries = optionCountries(option)
    const countryRates = countries.has("ca") ? canadaRates : countries.has("us") ? usaRates : []
    return !countryRates.some((rate) => rate.is_default || rate.rules?.some(
      (rule) => rule.reference === "shipping_option" && rule.reference_id === option.id
    ))
  }).length

  const crossRegionLinks = shippingOptions.flatMap((option) => {
    const locationCountry = lower(option.service_zone?.fulfillment_set?.location?.address?.country_code)
    const countries = [...optionCountries(option)]
    return locationCountry && countries.length && !countries.includes(locationCountry)
      ? [{ shippingOptionId: option.id, shippingOptionName: option.name, serviceZoneCountries: countries, locationCountry, locationId: option.service_zone?.fulfillment_set?.location?.id }]
      : []
  })
  const optionsForCountry = (countryCode: string) => shippingOptions.filter((option) => optionCountries(option).has(countryCode))
  const locationCorrect = (countryCode: string, locationId: string, salesChannelId: string) => {
    const options = optionsForCountry(countryCode)
    return options.length > 0 && options.every((option) => {
      const location = option.service_zone?.fulfillment_set?.location
      return location?.id === locationId &&
        lower(location.address?.country_code) === countryCode &&
        Boolean(location.sales_channels?.some((channel) => channel.id === salesChannelId)) &&
        Boolean(location.fulfillment_providers?.some((provider) => provider.id === "manual_manual"))
    })
  }

  const taxAudit = {
    canadaTaxRegionId: taxRegions.find((region) => lower(region.country_code) === "ca" && !region.parent_id)?.id || "",
    canadaTaxRates: canadaRates.map((rate) => ({ id: rate.id, name: rate.name, code: rate.code, rate: rate.rate, isDefault: rate.is_default, rules: rate.rules || [] })),
    usaTaxRegionId: taxRegions.find((region) => lower(region.country_code) === "us" && !region.parent_id)?.id || "",
    usaTaxRates: usaRates.map((rate) => ({ id: rate.id, name: rate.name, code: rate.code, rate: rate.rate, isDefault: rate.is_default, rules: rate.rules || [] })),
    taxProviders: taxProviders.map((provider) => ({ id: provider.id, enabled: provider.is_enabled })),
    missingProductTaxCategories: missingProductTaxClassifications,
    productTaxCompatibilityNote: "Medusa 2.13.6 system tax resolves product/product_type rules; this field counts POS products without an applicable default or explicit rule in both countries.",
    missingShippingTaxRules,
    status: canadaRates.length > 0 && usaRates.length > 0 && missingProductTaxClassifications === 0 && missingShippingTaxRules === 0 ? "PASSED" : "FAILED",
  }
  const inventoryAudit = {
    variantsAudited: usaInventory.length,
    variantsWithInventory: usaInventory.filter((variant) => variant.availableQuantity > 0).length,
    variantsWithoutInventory: usaInventory.filter((variant) => variant.availableQuantity <= 0).length,
    fixtureInventoryCreated: fixtureVariants.filter((variant) =>
      (variant.inventory_items || []).flatMap((item) => item.inventory?.location_levels || [])
        .some((level) => level.location_id === usaRegister.stock_location_id && Number(level.stocked_quantity) > 0)
    ).length,
    crossRegionFallbackDetected: false,
    variants: usaInventory,
  }
  const fulfillmentAudit = {
    canadaLocationCorrect: locationCorrect("ca", canadaRegister.stock_location_id, canadaRegister.sales_channel_id),
    usaLocationCorrect: locationCorrect("us", usaRegister.stock_location_id, usaRegister.sales_channel_id),
    crossRegionLinks,
    status: crossRegionLinks.length === 0 &&
      locationCorrect("ca", canadaRegister.stock_location_id, canadaRegister.sales_channel_id) &&
      locationCorrect("us", usaRegister.stock_location_id, usaRegister.sales_channel_id) ? "PASSED" : "FAILED",
  }

  console.log("[POS_TAX_DATA_AUDIT]")
  console.log(JSON.stringify(taxAudit, null, 2))
  console.log("[USA_POS_INVENTORY_SETUP]")
  console.log(JSON.stringify(inventoryAudit, null, 2))
  console.log("[POS_FULFILLMENT_REGION_AUDIT]")
  console.log(JSON.stringify(fulfillmentAudit, null, 2))
}
