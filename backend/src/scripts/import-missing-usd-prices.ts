import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"

interface CsvRow {
  product_id: string
  product_title: string
  product_handle: string
  variant_id: string
  variant_title: string
  cad_price: string
  current_usd_price: string
  suggested_usd_price: string
  status: string
}

interface ValidationIssue {
  variantId: string
  reason: string
}

interface PlannedAction {
  productTitle: string
  variantTitle: string
  variantId: string
  priceSetId: string
  currentCadPrice: string
  existingUsdPrice: string
  plannedUsdPrice: string
  action: "CREATE" | "UPDATE" | "SKIP"
  reason?: string
}

interface PriceSetLink {
  variant_id?: string
  price_set_id?: string
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let entry = ""
  let insideQuote = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (insideQuote && line[i + 1] === '"') {
        entry += '"'
        i++
      } else {
        insideQuote = !insideQuote
      }
    } else if (char === "," && !insideQuote) {
      result.push(entry.trim())
      entry = ""
    } else {
      entry += char
    }
  }

  result.push(entry.trim())
  return result
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim())
  if (lines.length <= 1) return []

  const headers = parseCsvLine(lines[0]).map((header) =>
    header.replace(/^\uFEFF/, "").trim().toLowerCase()
  )

  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, String(cols[index] ?? "").trim()])) as unknown as CsvRow
  })
}

function parseNonNegativePriceAmount(value: string): number | null {
  const text = String(value || "").trim()
  if (!text) return null
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(text)) return null
  const amount = Number(text)
  if (!Number.isFinite(amount) || amount < 0) return null
  return amount
}

function argValue(name: string): string | null {
  const prefix = `--${name}=`
  const positionalPrefix = `${name}=`
  const arg = process.argv.find((item) => item.startsWith(prefix) || item.startsWith(positionalPrefix))
  if (!arg) return null
  return arg.startsWith(prefix) ? arg.slice(prefix.length) : arg.slice(positionalPrefix.length)
}

function hasArg(name: string): boolean {
  return process.argv.includes(`--${name}`) || process.argv.includes(name)
}

async function resolvePriceSetId(query: any, variant: any): Promise<string> {
  const fromPrices = (variant.prices || []).find((price: any) => price.price_set_id)?.price_set_id
  if (fromPrices) return fromPrices

  const { data: links } = await query.graph({
    entity: "product_variant_price_set",
    fields: ["variant_id", "price_set_id"],
    filters: { variant_id: variant.id },
  })

  const link = ((links || []) as PriceSetLink[]).find((candidate) => candidate.price_set_id)
  return link?.price_set_id || ""
}

export default async function importMissingUsdPrices({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pricingModuleService = container.resolve<any>("pricing")

  const fileArg = argValue("file")
  const csvPath = path.resolve(process.cwd(), fileArg || "reports/missing-usd-prices.csv")
  const apply = hasArg("apply") && !hasArg("dry-run")
  const overwrite = hasArg("overwrite")
  const dryRun = !apply

  logger.info("[MISSING_USD_PRICE_IMPORT_START]")
  logger.info(`Mode: ${dryRun ? "DRY_RUN" : "APPLY"}`)
  logger.info(`CSV: ${csvPath}`)
  logger.info(`Overwrite existing USD prices: ${overwrite}`)

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`)
  }

  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"))
  const summary = {
    totalRows: rows.length,
    uniqueVariantIds: 0,
    validRows: 0,
    blankSkipped: 0,
    invalidSkipped: 0,
    existingSkipped: 0,
    missingVariantSkipped: 0,
    missingPriceSetSkipped: 0,
    createPlanned: 0,
    updatePlanned: 0,
    created: 0,
    updated: 0,
    failed: 0,
  }

  const seen = new Set<string>()
  const validationIssues: ValidationIssue[] = []
  const plannedActions: PlannedAction[] = []

  if (rows.length !== 41) {
    validationIssues.push({ variantId: "", reason: `CSV must contain exactly 41 rows; found ${rows.length}` })
  }

  for (const row of rows) {
    const variantId = String(row.variant_id || "").trim()
    const suggested = String(row.suggested_usd_price || "").trim()

    if (!variantId) {
      summary.invalidSkipped++
      validationIssues.push({ variantId, reason: "Missing variant_id" })
      continue
    }

    if (seen.has(variantId)) {
      summary.invalidSkipped++
      validationIssues.push({ variantId, reason: "Duplicate variant_id" })
      continue
    }
    seen.add(variantId)

    const hasSuggestedPrice = Boolean(suggested)

    if (hasSuggestedPrice && (/[^\d.]/.test(suggested) || /nan|infinity/i.test(suggested))) {
      summary.invalidSkipped++
      validationIssues.push({ variantId, reason: `Invalid suggested_usd_price '${suggested}'` })
      continue
    }

    const amount = hasSuggestedPrice ? parseNonNegativePriceAmount(suggested) : null
    if (hasSuggestedPrice && amount === null) {
      summary.invalidSkipped++
      validationIssues.push({ variantId, reason: `Invalid suggested_usd_price '${suggested}'` })
      continue
    }

    if (String(row.status || "").trim() !== "missing_usd") {
      summary.invalidSkipped++
      validationIssues.push({ variantId, reason: `Unexpected status '${row.status}'` })
      continue
    }

    try {
      const { data: products } = await query.graph({
        entity: "product",
        fields: [
          "id",
          "title",
          "handle",
          "variants.id",
          "variants.title",
          "variants.prices.id",
          "variants.prices.amount",
          "variants.prices.currency_code",
          "variants.prices.price_set_id",
        ],
        filters: { id: row.product_id },
      })

      const product = products?.[0] as any
      const variant = product?.variants?.find((candidate: any) => candidate.id === variantId)
      if (!variant) {
        summary.missingVariantSkipped++
        validationIssues.push({ variantId, reason: "Variant no longer exists or is not linked to product_id" })
        continue
      }

      if (product.title !== row.product_title) {
        validationIssues.push({ variantId, reason: `Product title changed from '${row.product_title}' to '${product.title}'` })
      }

      if ((product.handle || "") !== (row.product_handle || "")) {
        validationIssues.push({ variantId, reason: `Product handle changed from '${row.product_handle}' to '${product.handle || ""}'` })
      }

      if (variant.title !== row.variant_title) {
        validationIssues.push({ variantId, reason: `Variant title changed from '${row.variant_title}' to '${variant.title}'` })
      }

      const cadPrice = (variant.prices || []).find(
        (price: any) => String(price.currency_code || "").toLowerCase() === "cad"
      )

      if (!cadPrice) {
        validationIssues.push({ variantId, reason: "Existing CAD price is missing" })
        continue
      }

      if (String(cadPrice.amount) !== String(row.cad_price)) {
        validationIssues.push({ variantId, reason: `CAD price changed from '${row.cad_price}' to '${cadPrice.amount}'` })
        continue
      }

      const existingUsdPrice = (variant.prices || []).find(
        (price: any) => String(price.currency_code || "").toLowerCase() === "usd"
      )

      if (existingUsdPrice) {
        validationIssues.push({ variantId, reason: `Variant is no longer missing USD price; found '${existingUsdPrice.amount}'` })
        continue
      }

      const priceSetId = await resolvePriceSetId(query, variant)
      if (!priceSetId) {
        summary.missingPriceSetSkipped++
        validationIssues.push({ variantId, reason: "Referenced price set no longer exists" })
        continue
      }

      if (!hasSuggestedPrice) {
        summary.blankSkipped++
        plannedActions.push({
          productTitle: product.title,
          variantTitle: variant.title,
          variantId,
          priceSetId,
          currentCadPrice: String(cadPrice.amount),
          existingUsdPrice: "",
          plannedUsdPrice: "",
          action: "SKIP",
          reason: "suggested_usd_price is blank",
        })
        continue
      }

      summary.validRows++

      summary.createPlanned++
      plannedActions.push({
        productTitle: product.title,
        variantTitle: variant.title,
        variantId,
        priceSetId,
        currentCadPrice: String(cadPrice.amount),
        existingUsdPrice: "",
        plannedUsdPrice: String(amount),
        action: "CREATE",
      })
      if (!dryRun) {
        await pricingModuleService.createPrices([
          {
            price_set_id: priceSetId,
            currency_code: "usd",
            amount,
          },
        ])
        summary.created++
      }
    } catch (error: any) {
      summary.failed++
      validationIssues.push({ variantId, reason: error?.message || String(error) })
    }
  }

  summary.uniqueVariantIds = seen.size

  logger.info("[MISSING_USD_PRICE_VALIDATION_REPORT]")
  logger.info(JSON.stringify({
    valid: validationIssues.length === 0,
    moneyUnit: "major-unit price amount, matching Medusa Store API calculated_amount",
    totalRows: summary.totalRows,
    uniqueVariantIds: summary.uniqueVariantIds,
    blankRows: summary.blankSkipped,
    rowsWithSuggestedUsdPrice: summary.validRows,
    validationIssues,
    plannedActions,
  }, null, 2))

  if (!dryRun && validationIssues.length > 0) {
    logger.error("Validation failures exist. Aborting apply.")
    process.exit(1)
  }

  logger.info("[MISSING_USD_PRICE_IMPORT_DONE]")
  logger.info(JSON.stringify(summary, null, 2))

  if (!dryRun && summary.failed > 0) {
    process.exit(1)
  }
}
