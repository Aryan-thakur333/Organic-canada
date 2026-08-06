import type { ExecArgs } from "@medusajs/framework/types"
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { BUNDLE_MODULE } from "../modules/bundle/index.js"
import { classifyRegionalProduct } from "./lib/classify-regional-product.js"

async function safeAuditSection<T>(
  logger: any,
  sectionName: string,
  successfulSections: string[],
  unavailableSections: string[],
  errors: any[],
  callback: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    const res = await callback()
    successfulSections.push(sectionName)
    return res
  } catch (error: any) {
    logger.info(`\n[MULTI_REGION_SECTION_UNAVAILABLE]`)
    logger.info(JSON.stringify({
      section: sectionName,
      errorName: error.name || "Error",
      errorMessage: error.message || String(error)
    }, null, 2))
    unavailableSections.push(sectionName)
    errors.push({
      section: sectionName,
      errorName: error.name || "Error",
      errorMessage: error.message || String(error)
    })
    return fallback
  }
}

interface PriceGapMissing {
  productId: string
  productTitle: string
  variantId: string
  variantTitle: string
}

type SelectedVariantPrice = {
  currencyCode: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function getSelectedVariantPrices(variant: unknown): SelectedVariantPrice[] {
  if (!isRecord(variant) || !Array.isArray(variant.prices)) {
    return []
  }

  return variant.prices.flatMap((price) => {
    if (!isRecord(price)) {
      return []
    }

    return [{
      currencyCode: typeof price.currency_code === "string" ? price.currency_code : null,
    }]
  })
}

export default async function auditMultiRegion({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL)
  const cartModuleService = container.resolve(Modules.CART)
  const orderModuleService = container.resolve(Modules.ORDER)
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT)

  const successfulSections: string[] = []
  const unavailableSections: string[] = []
  const errors: any[] = []

  // PHASE 1: Start
  logger.info("\n[MULTI_REGION_AUDIT_START]")
  logger.info(JSON.stringify({
    nodeEnv: process.env.NODE_ENV || "development",
    queryResolved: !!query,
    installedMedusaVersion: "2.13.6"
  }, null, 2))

  // PHASE 5: Core Region Query
  const regionsData = await safeAuditSection(
    logger,
    "Core Regions",
    successfulSections,
    unavailableSections,
    errors,
    async () => {
      const { data: regions } = await query.graph({
        entity: "region",
        fields: [
          "id",
          "name",
          "currency_code",
          "automatic_taxes",
          "countries.*"
        ]
      })
      
      logger.info("\n[MULTI_REGION_REGION]")
      for (const r of regions) {
        logger.info(JSON.stringify({
          regionId: r.id,
          name: r.name,
          currencyCode: r.currency_code,
          automaticTaxes: r.automatic_taxes,
          countries: (r.countries || []).map((c: any) => c.iso_2)
        }, null, 2))
      }
      
      if (!regions || regions.length === 0) {
        logger.info("\n[MULTI_REGION_NO_REGIONS]")
      }
      return regions || []
    },
    []
  )

  if (!regionsData || regionsData.length === 0) {
    logger.info("\n[MULTI_REGION_CLASSIFICATION]")
    logger.info(JSON.stringify({
      status: "NOT_CONFIGURED",
      reasons: ["No regions found in the database."],
      blockers: []
    }, null, 2))

    logger.info("\n[MULTI_REGION_AUDIT_DONE]")
    logger.info(JSON.stringify({
      regionCount: 0,
      status: "NOT_CONFIGURED",
      successfulSections,
      unavailableSections,
      errors
    }, null, 2))
    return
  }

  // PHASE 6: Payment Providers via Query Graph
  const paymentProvidersData = await safeAuditSection(
    logger,
    "Payment Providers",
    successfulSections,
    unavailableSections,
    errors,
    async () => {
      const { data: regionsWithProviders } = await query.graph({
        entity: "region",
        fields: [
          "id",
          "name",
          "currency_code",
          "payment_providers.id"
        ]
      })
      
      logger.info("\n[MULTI_REGION_PAYMENT_PROVIDERS]")
      for (const r of regionsWithProviders) {
        const providerIds = Array.isArray(r.payment_providers)
          ? r.payment_providers.map((p: any) => p?.id).filter(Boolean)
          : []
        
        logger.info("\n[MULTI_REGION_PAYMENT_AUDIT]")
        logger.info(JSON.stringify({
          regionId: r.id,
          regionName: r.name,
          currencyCode: r.currency_code,
          providerIds,
          hasPaymentProvider: providerIds.length > 0
        }, null, 2))
      }
      return regionsWithProviders
    },
    []
  )

  // PHASE 7: Sales Channels
  const salesChannelsData = await safeAuditSection(
    logger,
    "Sales Channels",
    successfulSections,
    unavailableSections,
    errors,
    async () => {
      const channels = await salesChannelModuleService.listSalesChannels({})
      logger.info("\n[MULTI_REGION_SALES_CHANNELS]")
      logger.info(JSON.stringify({
        count: channels.length,
        salesChannels: channels.map(c => ({
          id: c.id,
          name: c.name,
          isDisabled: c.is_disabled
        }))
      }, null, 2))
      return channels
    },
    []
  )

  // PHASE 8: Shipping Options
  const shippingOptionsData = await safeAuditSection(
    logger,
    "Shipping Options",
    successfulSections,
    unavailableSections,
    errors,
    async () => {
      const options = await fulfillmentModuleService.listShippingOptions({})
      logger.info("\n[MULTI_REGION_SHIPPING_OPTIONS]")
      for (const opt of options) {
        logger.info(JSON.stringify({
          id: opt.id,
          name: opt.name,
          serviceZoneId: opt.service_zone_id,
          providerId: opt.provider_id,
          priceType: opt.price_type
        }, null, 2))
      }
      return options
    },
    []
  )

  // Get personalization templates and bundles to help classify products
  const personalizedProductIds = new Set<string>()
  try {
    const personalizationService = container.resolve<any>("personalization")
    if (personalizationService) {
      const templates = await personalizationService.listPersonalizationTemplates({}, { select: ["product_id"] })
      for (const t of templates) {
        if (t.product_id) personalizedProductIds.add(t.product_id)
      }
    }
  } catch (e) {}

  const bundleParentIds = new Set<string>()
  try {
    const bundleService = container.resolve<any>(BUNDLE_MODULE)
    if (bundleService) {
      const bundleItems = await bundleService.listBundleItems({}, { select: ["parent_product_id"] })
      for (const item of bundleItems) {
        if (item.parent_product_id) bundleParentIds.add(item.parent_product_id)
      }
    }
  } catch (e) {}

  // Classification stats
  let cadMandatoryTotal = 0
  let cadMandatoryWithPrice = 0
  let cadMandatoryMissing = 0

  let usdMandatoryTotal = 0
  let usdMandatoryWithPrice = 0
  let usdMandatoryMissing = 0

  const nonMandatoryGaps = {
    digital: { total: 0, missingCad: 0, missingUsd: 0 },
    test: { total: 0, missingCad: 0, missingUsd: 0 },
    debug: { total: 0, missingCad: 0, missingUsd: 0 },
    invalid: { total: 0, missingCad: 0, missingUsd: 0 }
  }

  // PHASE 9: Product Regional Price Audit with strict policy filters
  const priceGapsData = await safeAuditSection(
    logger,
    "Product Regional Prices",
    successfulSections,
    unavailableSections,
    errors,
    async () => {
      const { data: products } = await query.graph({
        entity: "product",
        fields: [
          "id",
          "title",
          "status",
          "metadata",
          "variants.id",
          "variants.title",
          "variants.prices.currency_code",
          "variants.prices.amount"
        ]
      })

      const uniqueCurrencies = Array.from(new Set(regionsData.map(r => r.currency_code?.toLowerCase()).filter(Boolean)))
      
      logger.info("\n[MULTI_REGION_PRODUCT_PRICE_GAPS]")

      for (const p of products) {
        const classif = classifyRegionalProduct(p)
        const isMandatoryStorefront = classif.mandatoryForStorefront
        const cType = classif.classification

        for (const v of (p.variants || [])) {
          const variantPrices = getSelectedVariantPrices(v)
          // CAD Check
          const hasCadPrice = variantPrices.some((price) => price.currencyCode?.toLowerCase() === "cad")
          if (isMandatoryStorefront) {
            cadMandatoryTotal++
            if (hasCadPrice) cadMandatoryWithPrice++
            else cadMandatoryMissing++
          } else {
            const gapKey = cType === "DIGITAL_PRODUCTION" ? "digital" : cType === "TEST_DATA" ? "test" : cType === "DEBUG_DATA" ? "debug" : "invalid"
            nonMandatoryGaps[gapKey].total++
            if (!hasCadPrice) nonMandatoryGaps[gapKey].missingCad++
          }

          // USD Check
          const hasUsdPrice = variantPrices.some((price) => price.currencyCode?.toLowerCase() === "usd")
          if (isMandatoryStorefront) {
            usdMandatoryTotal++
            if (hasUsdPrice) usdMandatoryWithPrice++
            else usdMandatoryMissing++
          } else {
            const gapKey = cType === "DIGITAL_PRODUCTION" ? "digital" : cType === "TEST_DATA" ? "test" : cType === "DEBUG_DATA" ? "debug" : "invalid"
            if (!hasUsdPrice) nonMandatoryGaps[gapKey].missingUsd++
          }
        }
      }

      // Log Mandatory Storefront Coverage (Phase 11 Requirement)
      logger.info("\n[MULTI_REGION_MANDATORY_PRICE_COVERAGE]")
      logger.info(JSON.stringify({
        cad: {
          total: cadMandatoryTotal,
          withPrice: cadMandatoryWithPrice,
          missing: cadMandatoryMissing
        },
        usd: {
          total: usdMandatoryTotal,
          withPrice: usdMandatoryWithPrice,
          missing: usdMandatoryMissing
        }
      }, null, 2))

      // Log Non-Mandatory Price Gaps (Phase 11 Requirement)
      logger.info("\n[MULTI_REGION_NON_MANDATORY_PRICE_GAPS]")
      logger.info(JSON.stringify(nonMandatoryGaps, null, 2))

      return [
        { currencyCode: "cad", totalVariants: cadMandatoryTotal, variantsWithPrice: cadMandatoryWithPrice, variantsMissingPrice: cadMandatoryMissing },
        { currencyCode: "usd", totalVariants: usdMandatoryTotal, variantsWithPrice: usdMandatoryWithPrice, variantsMissingPrice: usdMandatoryMissing }
      ]
    },
    []
  )

  // PHASE 10: Cart and Order Check
  const cartOrderData = await safeAuditSection(
    logger,
    "Cart and Order Usage",
    successfulSections,
    unavailableSections,
    errors,
    async () => {
      const carts = await cartModuleService.listCarts({}, { select: ["id", "region_id"] })
      const orders = await orderModuleService.listOrders({}, { select: ["id", "region_id"] })
      
      const cartsByRegion: Record<string, number> = {}
      let cartsWithoutRegion = 0
      for (const c of carts) {
        if (c.region_id) {
          cartsByRegion[c.region_id] = (cartsByRegion[c.region_id] || 0) + 1
        } else {
          cartsWithoutRegion++
        }
      }
      
      const ordersByRegion: Record<string, number> = {}
      let ordersWithoutRegion = 0
      for (const o of orders) {
        if (o.region_id) {
          ordersByRegion[o.region_id] = (ordersByRegion[o.region_id] || 0) + 1
        } else {
          ordersWithoutRegion++
        }
      }

      logger.info("\n[MULTI_REGION_CART_ORDER_USAGE]")
      logger.info(JSON.stringify({
        cartsByRegion,
        ordersByRegion,
        cartsWithoutRegion,
        ordersWithoutRegion
      }, null, 2))
      
      return { cartsByRegion, ordersByRegion }
    },
    { cartsByRegion: {}, ordersByRegion: {} }
  )

  // PHASE 11: Classification
  let status = "NOT_CONFIGURED"
  const blockers: string[] = []
  
  if (regionsData.length >= 2) {
    status = "PARTIALLY_CONFIGURED" // Phase 2 should remain PARTIALLY_CONFIGURED as per Phase H rules.
    
    // Safety check: block only on mandatory storefront price holes
    if (cadMandatoryMissing > 0 || usdMandatoryMissing > 0) {
      blockers.push("One or more regions are missing currency-compatible storefront product prices.")
    }
    
    // Payment provider check
    const missingProviders = paymentProvidersData.some(
      (r: any) => !r.payment_providers || r.payment_providers.length === 0
    )
    if (missingProviders) {
      blockers.push("One or more regions have no associated payment providers.")
    }
    
    // Check shipping
    if (shippingOptionsData.length === 0) {
      blockers.push("No shipping options available.")
    }
  } else {
    blockers.push("Fewer than 2 usable regions exist.")
  }

  logger.info("\n[MULTI_REGION_CLASSIFICATION]")
  logger.info(JSON.stringify({
    status,
    regionCount: regionsData.length,
    regions: regionsData.map(r => r.name),
    blockers
  }, null, 2))

  // PHASE 12: Final Output
  logger.info("\n[MULTI_REGION_AUDIT_DONE]")
  logger.info(JSON.stringify({
    regionCount: regionsData.length,
    status,
    successfulSections,
    unavailableSections,
    errors
  }, null, 2))
}
