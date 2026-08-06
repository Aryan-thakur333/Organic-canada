import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"

const REGIONS = [
  { slug: "usa", id: "reg_01KXT623CTGM9NJJYK2G4DQW7E", currency: "usd" },
  { slug: "canada", id: "reg_01KVJF9HSCYKAZC677GH1AC6C8", currency: "cad" },
]
const TEST_OR_DEBUG = /\btest\b|\be2e\b|debug|codex verification|cad-only|usd-only|empty file|browser test|smoke test/i

function publicVisibility(product: any) {
  const metadata = product?.metadata || {}
  if (metadata.storefront_visibility === "hidden" || metadata.catalog_classification === "test_or_debug_product") {
    return { visible: false, reason: "catalog_metadata" }
  }
  return TEST_OR_DEBUG.test(`${product?.title || ""} ${product?.handle || ""}`)
    ? { visible: false, reason: "test_or_debug" }
    : { visible: true, reason: "public" }
}

function resolveRegionPrice(variant: any, currency: string) {
  const calculated = variant?.calculated_price
  const calculatedAmount = Number(calculated?.calculated_amount ?? calculated?.amount)
  if (String(calculated?.currency_code || "").toLowerCase() === currency && Number.isFinite(calculatedAmount) && calculatedAmount > 0) {
    return { available: true, reason: null }
  }
  const matching = (variant?.prices || []).filter((price: any) => String(price?.currency_code || "").toLowerCase() === currency)
  const amounts = matching.map((price: any) => Number(price?.amount)).filter((amount: number) => Number.isFinite(amount) && amount > 0)
  if (amounts.length === 1) return { available: true, reason: null }
  if (matching.length) return { available: false, reason: "malformed_price" }
  return { available: false, reason: currency === "usd" ? "missing_usd_price" : "missing_cad_price" }
}

function inventoryEligible(variant: any) {
  if (!variant) return false
  if (variant.allow_backorder || !variant.manage_inventory) return true
  return variant.inventory_quantity === undefined || variant.inventory_quantity === null || Number(variant.inventory_quantity) > 0
}

async function getPublishableToken(query: any) {
  const { data } = await query.graph({ entity: "api_key", fields: ["token", "type"], filters: { type: "publishable" } })
  return data?.[0]?.token as string | undefined
}

export default async function reportStorefrontProductVisibility({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const token = await getPublishableToken(query)
  if (!token) throw new Error("No publishable API key is available for Store API visibility reporting")
  const backendUrl = (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
  const reportDirectory = path.resolve(process.cwd(), "..", "frontend", "reports")
  fs.mkdirSync(reportDirectory, { recursive: true })
  const summaries: Record<string, unknown> = {}

  for (const region of REGIONS) {
    const url = new URL(`${backendUrl}/store/products`)
    url.searchParams.set("limit", "200")
    url.searchParams.set("region_id", region.id)
    url.searchParams.set("fields", "id,title,handle,metadata,variants.id,variants.manage_inventory,variants.allow_backorder,variants.inventory_quantity,variants.prices.*,variants.calculated_price.*")
    const response = await fetch(url, { headers: { "x-publishable-api-key": token } })
    if (!response.ok) throw new Error(`Store API visibility request failed for ${region.slug}: ${response.status}`)
    const payload: any = await response.json()
    const products = Array.isArray(payload.products) ? payload.products : []
    const rows = products.map((product: any) => {
      const visibility = publicVisibility(product)
      const variant = product?.variants?.[0] || null
      const price = resolveRegionPrice(variant, region.currency)
      const inventory = inventoryEligible(variant)
      const finalEligible = visibility.visible && price.available
      const finalExclusionReason = !visibility.visible
        ? visibility.reason
        : !price.available
          ? price.reason
          : null
      return {
        productId: product.id,
        title: product.title || "",
        publicVisible: visibility.visible,
        regionalPriceAvailable: price.available,
        inventoryEligible: inventory,
        businessEligible: true,
        finalEligible,
        finalExclusionReason,
        filteredIndex: null as number | null,
        pageNumber: null as number | null,
      }
    })
    let filteredIndex = 0
    for (const row of rows) {
      if (row.finalEligible) {
        row.filteredIndex = filteredIndex
        row.pageNumber = Math.floor(filteredIndex / 24) + 1
        filteredIndex += 1
      }
    }
    const reportPath = path.join(reportDirectory, `storefront-product-visibility-${region.slug}.json`)
    fs.writeFileSync(reportPath, `${JSON.stringify(rows, null, 2)}\n`, "utf8")
    summaries[region.slug] = {
      rawApiCount: products.length,
      publicCount: rows.filter((row: any) => row.publicVisible).length,
      priceAvailableCount: rows.filter((row: any) => row.publicVisible && row.regionalPriceAvailable).length,
      eligibleCount: filteredIndex,
      totalPages: Math.max(1, Math.ceil(filteredIndex / 24)),
      reportPath,
    }
  }

  logger.info("[STOREFRONT_PRODUCT_VISIBILITY_REPORT]")
  logger.info(JSON.stringify({ ...summaries, priceWrites: 0, catalogWrites: 0 }, null, 2))
}
