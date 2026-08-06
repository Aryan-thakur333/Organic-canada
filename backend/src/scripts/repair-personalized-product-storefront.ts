import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, QueryContext } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"

const PRODUCT_ID = "prod_01KVSFB87RKDRSY8HR988M0Z9K"
const VARIANT_ID = "variant_01KVSFB88CG0FGKBQTG2KNBZE8"
const USA_REGION_ID = "reg_01KXT623CTGM9NJJYK2G4DQW7E"
const STOREFRONT_SALES_CHANNEL_ID = "sc_01KVJF9HK0YY92JES8P7VPZN12"
const REVIEWED_PRICE_FILE = path.resolve(process.cwd(), "reviewed-production-usd-prices.csv")

function parseCsvLine(line: string) {
  const cells: string[] = []
  let value = ""
  let quoted = false
  for (let index = 0; index < line.length; index++) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"'
        index++
      } else quoted = !quoted
    } else if (character === "," && !quoted) {
      cells.push(value.trim())
      value = ""
    } else value += character
  }
  cells.push(value.trim())
  return cells
}

function reviewedRow() {
  if (!fs.existsSync(REVIEWED_PRICE_FILE)) throw new Error(`Reviewed price file not found: ${REVIEWED_PRICE_FILE}`)
  const lines = fs.readFileSync(REVIEWED_PRICE_FILE, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean)
  const headers = parseCsvLine(lines.shift() || "").map((header) => header.toLowerCase())
  const rows = lines.map((line) => Object.fromEntries(headers.map((header, index) => [header, parseCsvLine(line)[index] || ""])))
  const row = rows.find((candidate) => candidate.product_id === PRODUCT_ID && candidate.variant_id === VARIANT_ID)
  if (!row) throw new Error("The reviewed USD price file does not contain the target product and variant")
  return row
}

function positiveAmount(value: unknown) {
  const text = String(value || "").trim()
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error(`Reviewed USD amount '${text}' is invalid`)
  const amount = Number(text)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Reviewed USD amount must be positive")
  return amount
}

export default async function repairPersonalizedProductStorefront({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query: any = container.resolve(ContainerRegistrationKeys.QUERY)
  const pricing: any = container.resolve(Modules.PRICING)
  const apply = process.argv.includes("--apply")
  const row = reviewedRow()
  const amount = positiveAmount(row.usd_amount)

  if (String(row.action).toUpperCase() !== "CREATE") throw new Error("Reviewed price action must be CREATE")
  if (String(row.classification).toUpperCase() !== "PRODUCTION_STOREFRONT") throw new Error("Target is not reviewed as a production storefront product")
  if (String(row.currency_code).toLowerCase() !== "usd") throw new Error("Reviewed price currency must be USD")
  if (String(row.source).toUpperCase() !== "MANUAL_MERCHANT_RATE") throw new Error("Reviewed price must originate from MANUAL_MERCHANT_RATE")

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id", "title", "status", "deleted_at", "sales_channels.id",
      "variants.id", "variants.title", "variants.prices.id", "variants.prices.amount",
      "variants.prices.currency_code", "variants.prices.price_set_id",
    ],
    filters: { id: PRODUCT_ID },
  })
  const product = products?.[0]
  const variant = product?.variants?.find((candidate: any) => candidate.id === VARIANT_ID)
  if (!product || !variant) throw new Error("Target product or variant no longer exists")
  if (product.status !== "published" || product.deleted_at) throw new Error("Target product is not an active published product")
  if (!(product.sales_channels || []).some((channel: any) => channel.id === STOREFRONT_SALES_CHANNEL_ID)) throw new Error("Target product is not assigned to the storefront sales channel")
  const cadPrice = (variant.prices || []).find((price: any) => String(price.currency_code).toLowerCase() === "cad")
  const existingUsd = (variant.prices || []).find((price: any) => String(price.currency_code).toLowerCase() === "usd")
  if (!cadPrice || String(cadPrice.amount) !== String(row.cad_amount)) throw new Error("Current CAD price no longer matches the reviewed source row")
  if (existingUsd && Number(existingUsd.amount) !== amount) throw new Error(`A different USD price already exists (${existingUsd.amount}); overwrite is blocked`)
  const priceSetId = (variant.prices || []).find((price: any) => price.price_set_id)?.price_set_id
  if (!priceSetId) throw new Error("Target variant does not have a price set")

  const before = {
    productId: product.id,
    productTitle: product.title,
    variantId: variant.id,
    priceSetId,
    cadPrice: { id: cadPrice.id, amount: cadPrice.amount, currencyCode: cadPrice.currency_code },
    usdPrice: existingUsd ? { id: existingUsd.id, amount: existingUsd.amount, currencyCode: existingUsd.currency_code } : null,
  }
  logger.info("[PERSONALIZED_PRODUCT_USD_PRICE_REPAIR_PLAN]")
  logger.info(JSON.stringify({ mode: apply ? "APPLY" : "DRY_RUN", sourceFile: REVIEWED_PRICE_FILE, reviewedRow: row, before, plannedUsdAmount: amount, overwriteAllowed: false }, null, 2))

  let created: any = null
  if (apply && !existingUsd) {
    const result = await pricing.createPrices([{ price_set_id: priceSetId, currency_code: "usd", amount }])
    created = Array.isArray(result) ? result[0] : result
  }

  const { data: verifiedVariants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "prices.id", "prices.amount", "prices.currency_code", "calculated_price.*"],
    filters: { id: VARIANT_ID },
    context: { calculated_price: QueryContext({ region_id: USA_REGION_ID, currency_code: "usd" }) },
  })
  const verified = verifiedVariants?.[0]
  const rawUsd = (verified?.prices || []).find((price: any) => String(price.currency_code).toLowerCase() === "usd")
  const calculated = verified?.calculated_price
  const calculatedAmount = Number(calculated?.calculated_amount ?? calculated?.amount)
  const verifiedPassed = Boolean(rawUsd && Number(rawUsd.amount) === amount && calculated?.currency_code === "usd" && calculatedAmount === amount)
  if (apply && !verifiedPassed) throw new Error("USD price creation completed but post-write regional calculation did not verify")

  logger.info("[PERSONALIZED_PRODUCT_USD_PRICE_REPAIR_DONE]")
  logger.info(JSON.stringify({
    status: apply ? (verifiedPassed ? "PASSED" : "FAILED") : "DRY_RUN_PASSED",
    createdPriceId: created?.id || rawUsd?.id || null,
    usdAmount: rawUsd?.amount ?? null,
    calculatedUsdAmount: Number.isFinite(calculatedAmount) ? calculatedAmount : null,
    calculatedCurrency: calculated?.currency_code || null,
    cadPricePreserved: Number(cadPrice.amount) === Number(row.cad_amount),
    writesPerformed: apply && !existingUsd ? 1 : 0,
  }, null, 2))
}
