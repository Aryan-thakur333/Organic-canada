import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import { HIGH_PRICE_REVIEW_THRESHOLD, ReviewRow, firstAmount, isTestOrDebugProduct, priceFlags, pricesForCurrency, readReviewCsv, writeReviewCsv } from "./lib/storefront-regional-price-review.js"

const FIELDS = ["id", "title", "handle", "status", "metadata", "type.value", "categories.name", "variants.id", "variants.title", "variants.manage_inventory", "variants.allow_backorder", "variants.inventory_quantity", "variants.prices.id", "variants.prices.currency_code", "variants.prices.amount", "variants.prices.price_set_id"]

function reviewRow(product: any, variant: any, prior?: ReviewRow): ReviewRow {
  const usd = pricesForCurrency(variant, "usd"), cad = pricesForCurrency(variant, "cad")
  const flags = [...priceFlags(variant, "usd"), ...priceFlags(variant, "cad")]
  if (!usd.length && !cad.length) flags.push("NO_PRICE_FOR_ANY_PUBLIC_REGION")
  if (usd.length && cad.length && !flags.some((flag) => /ZERO|DUPLICATE|HIGH/.test(flag))) flags.push("VALID_BOTH_REGIONS")
  if (variant.manage_inventory && !variant.allow_backorder && variant.inventory_quantity !== undefined && Number(variant.inventory_quantity) <= 0) flags.push("NO_ACTIVE_VARIANT")
  return {
    product_id: product.id, product_title: product.title || "", product_handle: product.handle || "", variant_id: variant.id, variant_title: variant.title || "",
    product_type: product.type?.value || "", category: (product.categories || []).map((category: any) => category.name).filter(Boolean).join(" | "),
    current_usd: firstAmount(usd), current_cad: firstAmount(cad), usd_status: usd.length ? "present" : "missing", cad_status: cad.length ? "present" : "missing",
    review_flags: flags.join(" | "), suggested_usd: prior?.suggested_usd || "", suggested_cad: prior?.suggested_cad || "",
    approved_usd: prior?.approved_usd || "", approved_cad: prior?.approved_cad || "", merchant_notes: prior?.merchant_notes || "", approved: prior?.approved || "false",
  }
}

export default async function reportStorefrontRegionalPriceMerchantReview({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER), query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "product", fields: FIELDS })
  const reportPath = path.resolve(process.cwd(), "reports", "storefront-regional-price-merchant-review.csv")
  const previous = fs.existsSync(reportPath) ? new Map(readReviewCsv(reportPath).map((row) => [row.variant_id, row])) : new Map<string, ReviewRow>()
  const publicIds = new Set(JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "..", "frontend", "reports", "storefront-product-visibility-usa.json"), "utf8")).filter((row: any) => row.publicVisible).map((row: any) => row.productId))
  const rows = (data || []).filter((product: any) => publicIds.has(product.id) && !isTestOrDebugProduct(product)).flatMap((product: any) => (product.variants || []).map((variant: any) => reviewRow(product, variant, previous.get(variant.id))))
  fs.mkdirSync(path.dirname(reportPath), { recursive: true }); writeReviewCsv(reportPath, rows)
  const count = (flag: string) => rows.filter((row) => row.review_flags.split(" | ").includes(flag)).length
  const both = rows.filter((row) => row.usd_status === "present" && row.cad_status === "present")
  const by = (field: keyof ReviewRow) => Object.fromEntries([...new Set(rows.map((row) => row[field] || "Unclassified"))].sort().map((key) => [key, rows.filter((row) => (row[field] || "Unclassified") === key).length]))
  const top = (field: "current_usd" | "current_cad") => rows.filter((row) => row[field] !== "").sort((a, b) => Number(b[field]) - Number(a[field])).slice(0, 20).map((row) => ({ product: row.product_title, variant: row.variant_title, amount: row[field] }))
  const visibility = (region: "usa" | "canada") => JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "..", "frontend", "reports", `storefront-product-visibility-${region}.json`), "utf8")) as Array<{ productId: string; title: string; publicVisible: boolean; regionalPriceAvailable: boolean }>
  const usaVisibility = visibility("usa"), canadaVisibility = visibility("canada")
  const publicProducts = usaVisibility.filter((row) => row.publicVisible)
  const summary = { publicProductCount: publicProducts.length, publicVariantCount: rows.length, noActiveVariantProducts: publicProducts.filter((row) => !rows.some((review) => review.product_id === row.productId)).map((row) => ({ id: row.productId, title: row.title })), bothCurrenciesCount: new Set(both.map((row) => row.product_id)).size, bothCurrenciesVariantCount: both.length, missingUsdCount: publicProducts.filter((row) => !row.regionalPriceAvailable).length, missingCadCount: canadaVisibility.filter((row) => row.publicVisible && !row.regionalPriceAvailable).length, zeroPriceCount: count("ZERO_USD") + count("ZERO_CAD"), highUsdReviewCount: count("HIGH_USD_REVIEW"), highCadReviewCount: count("HIGH_CAD_REVIEW"), duplicatePriceCount: count("DUPLICATE_USD_PRICE") + count("DUPLICATE_CAD_PRICE"), threshold: HIGH_PRICE_REVIEW_THRESHOLD, productTypes: by("product_type"), categories: by("category"), topUsd: top("current_usd"), topCad: top("current_cad"), unavailableBoth: rows.filter((row) => row.usd_status === "missing" && row.cad_status === "missing").map((row) => row.product_title), usaOnly: rows.filter((row) => row.usd_status === "present" && row.cad_status === "missing").map((row) => row.product_title), canadaOnly: rows.filter((row) => row.usd_status === "missing" && row.cad_status === "present").map((row) => row.product_title), reportPath, writesPerformed: 0 }
  const markdown = `# Storefront Regional Price Data Quality Report\n\nPrices use Medusa major units. USD/CAD values at or above ${HIGH_PRICE_REVIEW_THRESHOLD} are review flags only; this report does not infer intended prices.\n\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n\nDatabase writes: 0.\n`
  fs.writeFileSync(path.resolve(process.cwd(), "..", "STOREFRONT_REGIONAL_PRICE_DATA_QUALITY_REPORT.md"), markdown, "utf8")
  logger.info("[STOREFRONT_REGIONAL_PRICE_MERCHANT_REVIEW]"); logger.info(JSON.stringify(summary, null, 2))
}
