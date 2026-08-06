import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { BUNDLE_MODULE } from "../modules/bundle/index.js"
import * as fs from "fs"
import * as path from "path"

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
  metadata?: any
  variants?: AuditedVariant[]
}

type ProductVariantWithPrices = NonNullable<AuditedProduct["variants"]>[number]

export default async function exportMissingRegionPrices({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const regionModuleService = container.resolve(Modules.REGION)

  logger.info("[EXPORT_MISSING_PRICES_START]")

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

  const products: AuditedProduct[] = rawProducts.map((product) => ({
    id: product.id,
    title: product.title,
    status: product.status,
    metadata: product.metadata,
    variants: (product.variants || []).map((variant) => {
      const pricedVariant = variant as typeof variant & { prices?: ProductVariantWithPrices["prices"] }
      return {
        id: pricedVariant.id,
        title: pricedVariant.title,
        prices: (pricedVariant.prices || []).map((price) => ({
        currency_code: price.currency_code,
        amount: price.amount,
        })),
      }
    }),
  }))

  // CSV Headers
  const csvRows = [
    "product_id,product_title,variant_id,variant_title,product_status,product_category,currency_code,existing_prices,suggested_amount,action"
  ]

  for (const p of products) {
    const classif = classifyRegionalProduct(p)
    const category = classif.classification.toLowerCase()

    for (const v of p.variants || []) {
      const existing = (v.prices || []).map((pr) => `${pr.amount}${pr.currency_code}`).join("|")

      for (const currency of currencies as string[]) {
        const hasPrice = (v.prices || []).some(
          (price: any) => price.currency_code?.toLowerCase() === currency
        )

        if (!hasPrice) {
          // Escape helper for CSV cells containing commas/quotes
          const escapeCsv = (str: string) => {
            const clean = str.replace(/"/g, '""')
            return clean.includes(",") || clean.includes('"') ? `"${clean}"` : clean
          }

          const row = [
            p.id,
            escapeCsv(p.title),
            v.id,
            escapeCsv(v.title),
            p.status,
            category,
            currency,
            escapeCsv(existing || "none"),
            "", // suggested_amount remains blank
            "SKIP" // action defaults to SKIP
          ].join(",")

          csvRows.push(row)
        }
      }
    }
  }

  const exportPath = path.resolve(process.cwd(), "missing-region-prices.csv")
  fs.writeFileSync(exportPath, csvRows.join("\n"), "utf8")

  logger.info(`[EXPORT_MISSING_PRICES_DONE] Generated ${csvRows.length - 1} missing price rows at: ${exportPath}`)
}
