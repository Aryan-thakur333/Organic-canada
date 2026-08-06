import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { BUNDLE_MODULE } from "../modules/bundle/index.js"
import PersonalizationService from "../modules/personalization/service.js"
import { classifyRegionalProduct } from "./lib/classify-regional-product.js"

interface AuditedPrice {
  currency_code: string
  amount: number
}

interface AuditedVariant {
  id: string
  title: string
  prices: AuditedPrice[]
}

interface AuditedProduct {
  id: string
  title: string
  status: string
  metadata?: Record<string, unknown>
  variants?: AuditedVariant[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function mapAuditedProducts(values: unknown[]): AuditedProduct[] {
  return values.flatMap((value) => {
    if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string" || typeof value.status !== "string") {
      return []
    }

    const variants = Array.isArray(value.variants)
      ? value.variants.flatMap((variant) => {
          if (!isRecord(variant) || typeof variant.id !== "string" || typeof variant.title !== "string") return []
          const prices = Array.isArray(variant.prices)
            ? variant.prices.flatMap((price) => isRecord(price) && typeof price.currency_code === "string" && typeof price.amount === "number"
              ? [{ currency_code: price.currency_code, amount: price.amount }]
              : [])
            : []
          return [{ id: variant.id, title: variant.title, prices }]
        })
      : []

    return [{
      id: value.id,
      title: value.title,
      status: value.status,
      metadata: isRecord(value.metadata) ? value.metadata : undefined,
      variants,
    }]
  })
}

interface MissingVariantPrice {
  productId: string
  productTitle: string
  variantId: string
  variantTitle: string
  type: string
}

export default async function auditRegionPrices({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const regionModuleService = container.resolve(Modules.REGION)

  logger.info("[REGION_PRICE_AUDIT_START]")

  // Fetch all regions to know their currency codes
  const regions = await regionModuleService.listRegions({})
  const currencies = Array.from(new Set(regions.map((r) => r.currency_code?.toLowerCase()).filter(Boolean)))

  // Get active personalization templates to identify personalized products
  const personalizedProductIds = new Set<string>()
  try {
    const personalizationService = container.resolve<PersonalizationService>("personalization")
    if (personalizationService) {
      if (typeof personalizationService.listPersonalizationTemplates !== "function") {
        throw new Error("Required method listPersonalizationTemplates does not exist on resolved PersonalizationService")
      }
      const templates = await personalizationService.listPersonalizationTemplates({}, { select: ["product_id"] })
      for (const t of templates) {
        if (t.product_id) personalizedProductIds.add(t.product_id)
      }
    }
  } catch (e: any) {
    logger.warn(`Personalization service resolution failed: ${e.message}`)
  }

  // Get bundle items to identify bundle products
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

  // Query products and variants with their prices
  const { data: rawProducts } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "status",
      "metadata",
      "variants.id",
      "variants.title",
      "variants.prices.currency_code",
      "variants.prices.amount",
    ],
  })

  const products = mapAuditedProducts(rawProducts)

  logger.info(`Auditing ${products.length} products with ${currencies.length} active currencies: ${currencies.join(", ")}`)

  for (const currency of currencies as string[]) {
    // Find a matching region
    const region = regions.find((r) => r.currency_code?.toLowerCase() === currency)
    const regionId = region?.id || null

    let totalActiveStorefrontVariants = 0
    let activeStorefrontWithPrice = 0
    let activeStorefrontMissingPrice = 0

    let totalDraftVariants = 0
    let draftWithPrice = 0
    let draftMissingPrice = 0

    let totalDigitalVariants = 0
    let digitalWithPrice = 0
    let digitalMissingPrice = 0

    let totalSubscriptionVariants = 0
    let subscriptionWithPrice = 0
    let subscriptionMissingPrice = 0

    let totalPersonalizedVariants = 0
    let personalizedWithPrice = 0
    let personalizedMissingPrice = 0

    let totalBundleVariants = 0
    let bundleWithPrice = 0
    let bundleMissingPrice = 0

    let totalTestVariants = 0
    let testWithPrice = 0
    let testMissingPrice = 0

    const missingList: MissingVariantPrice[] = []

    for (const p of products) {
      const classif = classifyRegionalProduct(p)
      const cType = classif.classification

      for (const v of p.variants || []) {
        const hasPrice = (v.prices || []).some(
          (price: any) => price.currency_code?.toLowerCase() === currency
        )

        // Classify variants using the shared classifier
        if (p.status !== "published") {
          totalDraftVariants++
          if (hasPrice) draftWithPrice++
          else draftMissingPrice++
        } else if (cType === "TEST_DATA") {
          totalTestVariants++
          if (hasPrice) testWithPrice++
          else testMissingPrice++
        } else if (cType === "DIGITAL_PRODUCTION") {
          totalDigitalVariants++
          if (hasPrice) digitalWithPrice++
          else digitalMissingPrice++
        } else if (cType === "DEBUG_DATA" || cType === "INVALID_DATA" || cType === "MANUAL_REVIEW") {
          totalTestVariants++
          if (hasPrice) testWithPrice++
          else testMissingPrice++
        } else {
          // PRODUCTION_STOREFRONT standard storefront product
          totalActiveStorefrontVariants++
          if (hasPrice) activeStorefrontWithPrice++
          else activeStorefrontMissingPrice++
        }

        if (!hasPrice) {
          missingList.push({
            productId: p.id,
            productTitle: p.title,
            variantId: v.id,
            variantTitle: v.title,
            type: cType.toLowerCase(),
          })
        }
      }
    }

    logger.info("\n[REGION_PRICE_AUDIT]")
    logger.info(
      JSON.stringify(
        {
          regionId,
          currencyCode: currency,
          totalActiveStorefrontVariants,
          variantsWithPrice: activeStorefrontWithPrice,
          variantsMissingPrice: activeStorefrontMissingPrice,
          classifications: {
            active_standard: { total: totalActiveStorefrontVariants, withPrice: activeStorefrontWithPrice, missing: activeStorefrontMissingPrice },
            draft: { total: totalDraftVariants, withPrice: draftWithPrice, missing: draftMissingPrice },
            digital: { total: totalDigitalVariants, withPrice: digitalWithPrice, missing: digitalMissingPrice },
            subscription: { total: totalSubscriptionVariants, withPrice: subscriptionWithPrice, missing: subscriptionMissingPrice },
            personalized: { total: totalPersonalizedVariants, withPrice: personalizedWithPrice, missing: personalizedMissingPrice },
            bundle: { total: totalBundleVariants, withPrice: bundleWithPrice, missing: bundleMissingPrice },
            test: { total: totalTestVariants, withPrice: testWithPrice, missing: testMissingPrice },
          },
          missing: missingList.map((m) => ({
            productId: m.productId,
            productTitle: m.productTitle,
            variantId: m.variantId,
            variantTitle: m.variantTitle,
            type: m.type,
          })),
        },
        null,
        2
      )
    )
  }
}
