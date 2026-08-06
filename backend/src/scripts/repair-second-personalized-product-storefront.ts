import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, QueryContext } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import { PERSONALIZATION_MODULE } from "../modules/personalization"

const PRODUCT_ID = "prod_01KVSFB8GJWSH1JMXG0XPG2F6N"
const VARIANT_ID = "variant_01KVSFB8HDHXQHA4PKSS9PQ89A"
const TEMPLATE_ID = "ptmpl_01KYSXC313QZRCZMCE2F32VEX8"
const EXPECTED_TEMPLATE_TITLE = "Personalize Product"
const ALLOWED_CURRENT_TEMPLATE_TITLES = new Set([EXPECTED_TEMPLATE_TITLE, "Parsonalize Product"])
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
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === "," && !quoted) {
      cells.push(value.trim())
      value = ""
    } else {
      value += character
    }
  }
  cells.push(value.trim())
  return cells
}

function loadReviewedRow() {
  if (!fs.existsSync(REVIEWED_PRICE_FILE)) {
    throw new Error(`Reviewed price file not found: ${REVIEWED_PRICE_FILE}`)
  }
  const lines = fs.readFileSync(REVIEWED_PRICE_FILE, "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(Boolean)
  const headers = parseCsvLine(lines.shift() || "").map((header) => header.toLowerCase())
  const rows = lines.map((line) => {
    const values = parseCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]))
  })
  const row = rows.find((candidate) => candidate.product_id === PRODUCT_ID && candidate.variant_id === VARIANT_ID)
  if (!row) throw new Error("The reviewed USD price file does not contain the exact target product and variant")
  return row
}

function positiveAmount(value: unknown) {
  const text = String(value || "").trim()
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error(`Reviewed USD amount '${text}' is invalid`)
  const amount = Number(text)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Reviewed USD amount must be positive")
  return amount
}

export default async function repairSecondPersonalizedProductStorefront({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query: any = container.resolve(ContainerRegistrationKeys.QUERY)
  const pricingService: any = container.resolve(Modules.PRICING)
  const personalizationService: any = container.resolve(PERSONALIZATION_MODULE)
  const apply = process.argv.includes("--apply")
  const reviewed = loadReviewedRow()
  const reviewedUsdAmount = positiveAmount(reviewed.usd_amount)

  if (String(reviewed.action).toUpperCase() !== "CREATE") throw new Error("Reviewed price action must be CREATE")
  if (String(reviewed.classification).toUpperCase() !== "PRODUCTION_STOREFRONT") throw new Error("Target is not approved as a production storefront product")
  if (String(reviewed.currency_code).toLowerCase() !== "usd") throw new Error("Reviewed price currency must be USD")
  if (String(reviewed.source).toUpperCase() !== "MANUAL_MERCHANT_RATE") throw new Error("Reviewed value must originate from MANUAL_MERCHANT_RATE")

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id", "title", "status", "deleted_at", "sales_channels.id", "variants.id",
      "variants.prices.id", "variants.prices.amount", "variants.prices.currency_code",
      "variants.prices.price_set_id",
    ],
    filters: { id: PRODUCT_ID },
  })
  const product = products?.[0]
  const variant = product?.variants?.find((candidate: any) => candidate.id === VARIANT_ID)
  if (!product || !variant) throw new Error("Target product or variant no longer exists")
  if (product.status !== "published" || product.deleted_at) throw new Error("Target product is not an active published product")
  if (!(product.sales_channels || []).some((channel: any) => channel.id === STOREFRONT_SALES_CHANNEL_ID)) {
    throw new Error("Target product is not assigned to the USA storefront sales channel")
  }

  const cadPrice = (variant.prices || []).find((price: any) => String(price.currency_code).toLowerCase() === "cad")
  const existingUsd = (variant.prices || []).find((price: any) => String(price.currency_code).toLowerCase() === "usd")
  if (!cadPrice || Number(cadPrice.amount) !== Number(reviewed.cad_amount)) {
    throw new Error("Current CAD price no longer matches the reviewed source row")
  }
  if (existingUsd && Number(existingUsd.amount) !== reviewedUsdAmount) {
    throw new Error(`A different USD price already exists (${existingUsd.amount}); overwrite is blocked`)
  }
  const priceSetId = (variant.prices || []).find((price: any) => price.price_set_id)?.price_set_id
  if (!priceSetId) throw new Error("Target variant has no price set")

  const template = await personalizationService.getTemplateWithFields(TEMPLATE_ID)
  if (!template || template.product_id !== PRODUCT_ID || template.variant_id !== VARIANT_ID) {
    throw new Error("The expected variant-scoped personalization template link is missing")
  }
  if (!template.is_active || template.deleted_at) throw new Error("The expected personalization template is not active")
  if (!ALLOWED_CURRENT_TEMPLATE_TITLES.has(String(template.title))) {
    throw new Error(`Unexpected template title '${template.title}'; automatic rename is blocked`)
  }
  if (!(template.fields || []).length) throw new Error("The personalization template has no fields")

  const titleNeedsCorrection = template.title !== EXPECTED_TEMPLATE_TITLE
  logger.info("[SECOND_PERSONALIZED_PRODUCT_REPAIR_PLAN]")
  logger.info(JSON.stringify({
    mode: apply ? "APPLY" : "DRY_RUN",
    productId: PRODUCT_ID,
    productTitle: product.title,
    variantId: VARIANT_ID,
    priceSetId,
    reviewedPriceSource: REVIEWED_PRICE_FILE,
    reviewedUsdAmount,
    cadPriceBefore: { id: cadPrice.id, amount: cadPrice.amount, currencyCode: cadPrice.currency_code },
    usdPriceBefore: existingUsd ? { id: existingUsd.id, amount: existingUsd.amount, currencyCode: existingUsd.currency_code } : null,
    overwriteAllowed: false,
    templateId: TEMPLATE_ID,
    templateTitleBefore: template.title,
    templateTitleAfter: EXPECTED_TEMPLATE_TITLE,
    plannedWrites: Number(!existingUsd) + Number(titleNeedsCorrection),
  }, null, 2))

  let createdPrice: any = null
  let writesPerformed = 0
  if (apply && !existingUsd) {
    const result = await pricingService.createPrices([{
      price_set_id: priceSetId,
      currency_code: "usd",
      amount: reviewedUsdAmount,
    }])
    createdPrice = Array.isArray(result) ? result[0] : result
    writesPerformed += 1
  }
  if (apply && titleNeedsCorrection) {
    await personalizationService.updatePersonalizationTemplates({
      id: TEMPLATE_ID,
      title: EXPECTED_TEMPLATE_TITLE,
    })
    writesPerformed += 1
  }

  const { data: verifiedVariants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "prices.id", "prices.amount", "prices.currency_code", "calculated_price.*"],
    filters: { id: VARIANT_ID },
    context: { calculated_price: QueryContext({ region_id: USA_REGION_ID, currency_code: "usd" }) },
  })
  const verifiedVariant = verifiedVariants?.[0]
  const rawUsd = (verifiedVariant?.prices || []).find((price: any) => String(price.currency_code).toLowerCase() === "usd")
  const calculated = verifiedVariant?.calculated_price
  const calculatedUsdAmount = Number(calculated?.calculated_amount ?? calculated?.amount)
  const verifiedTemplate = await personalizationService.getTemplateWithFields(TEMPLATE_ID)
  const pricePassed = Boolean(
    rawUsd
    && Number(rawUsd.amount) === reviewedUsdAmount
    && calculated?.currency_code === "usd"
    && calculatedUsdAmount === reviewedUsdAmount
  )
  const templatePassed = Boolean(
    verifiedTemplate?.is_active
    && !verifiedTemplate?.deleted_at
    && verifiedTemplate?.product_id === PRODUCT_ID
    && verifiedTemplate?.variant_id === VARIANT_ID
    && verifiedTemplate?.title === EXPECTED_TEMPLATE_TITLE
    && verifiedTemplate?.fields?.length
  )
  if (apply && (!pricePassed || !templatePassed)) {
    throw new Error("Repair writes completed but post-write price/template verification failed")
  }

  logger.info("[SECOND_PERSONALIZED_PRODUCT_REPAIR_DONE]")
  logger.info(JSON.stringify({
    status: apply ? (pricePassed && templatePassed ? "PASSED" : "FAILED") : "DRY_RUN_PASSED",
    createdPriceId: createdPrice?.id || rawUsd?.id || null,
    usdRawAmount: rawUsd?.amount ?? null,
    usdCalculatedAmount: Number.isFinite(calculatedUsdAmount) ? calculatedUsdAmount : null,
    calculatedCurrency: calculated?.currency_code || null,
    cadPricePreserved: Number(cadPrice.amount) === Number(reviewed.cad_amount),
    templateId: verifiedTemplate?.id || null,
    templateTitle: verifiedTemplate?.title || null,
    templateActive: Boolean(verifiedTemplate?.is_active),
    fieldsHydrated: Boolean(verifiedTemplate?.fields?.length),
    writesPerformed,
  }, null, 2))
}
