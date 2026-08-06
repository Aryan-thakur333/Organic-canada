import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { classifyRegionalProduct } from "./lib/classify-regional-product.js"
import * as fs from "fs"
import * as path from "path"

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

export default async function generateProductionUsdPriceCsv({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  logger.info("[GENERATE_PRODUCTION_USD_CSV_START]")

  // Query all products and variants
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

  const csvRows = [
    "product_id,product_title,product_status,product_type,variant_id,variant_title,cad_amount,usd_amount,currency_code,classification,action,notes"
  ]

  let count = 0

  for (const p of products) {
    const classificationResult = classifyRegionalProduct(p)
    if (!classificationResult.mandatoryForStorefront) {
      continue
    }

    const isDigital = p.metadata?.is_digital === true || p.metadata?.is_digital === "true"
    const pType = isDigital ? "digital" : "physical"

    for (const v of p.variants || []) {
      const hasUsdPrice = (v.prices || []).some(
        (price) => price.currency_code?.toLowerCase() === "usd"
      )

      if (!hasUsdPrice) {
        const cadPrice = (v.prices || []).find(
          (price) => price.currency_code?.toLowerCase() === "cad"
        )
        const cadAmount = cadPrice ? cadPrice.amount : ""

        // Escape commas/quotes in titles
        const escapeCsv = (str: string) => {
          const clean = str.replace(/"/g, '""')
          return clean.includes(",") || clean.includes('"') ? `"${clean}"` : clean
        }

        const row = [
          p.id,
          escapeCsv(p.title),
          p.status,
          pType,
          v.id,
          escapeCsv(v.title),
          cadAmount,
          "", // usd_amount is initially blank
          "usd",
          "PRODUCTION_STOREFRONT",
          "REVIEW", // Action defaults to REVIEW
          "Legitimate physical storefront item missing USD price"
        ].join(",")

        csvRows.push(row)
        count++
      }
    }
  }

  const exportPath = path.resolve(process.cwd(), "missing-production-usd-prices.csv")
  fs.writeFileSync(exportPath, csvRows.join("\n"), "utf8")

  logger.info(`[GENERATE_PRODUCTION_USD_CSV_DONE] Exported ${count} mandatory USD-missing rows to: ${exportPath}`)
}
