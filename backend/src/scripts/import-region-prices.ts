import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"

interface SelectedVariantPrice {
  id: string
  amount: number
  currency_code: string
  price_set_id?: string
}

interface SelectedVariantPriceSet {
  id?: string
}

export default async function importRegionPrices({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pricingModuleService = container.resolve<any>("pricingModuleService")

  logger.info("[IMPORT_PRICES_START]")

  // Parse arguments
  const args = process.argv
  const fileArg = args.find((arg) => arg.startsWith("--file="))
  const defaultFile = args.includes("--apply") ? "approved-production-usd-prices.csv" : "missing-production-usd-prices.csv"
  const csvFile = fileArg ? fileArg.split("=")[1] : defaultFile
  
  const apply = args.includes("--apply")
  const dryRun = !apply

  const overwriteArg = args.find((arg) => arg.startsWith("--allow-overwrite="))
  const allowOverwrite = overwriteArg ? overwriteArg.split("=")[1] === "true" : false

  const classArg = args.find((arg) => arg.startsWith("--classification="))
  const targetClassification = classArg ? classArg.split("=")[1] : "PRODUCTION_STOREFRONT"

  const currencyArg = args.find((arg) => arg.startsWith("--currency="))
  const targetCurrency = currencyArg ? currencyArg.split("=")[1].toLowerCase() : "usd"

  logger.info(`Mode: ${dryRun ? "DRY RUN" : "APPLY"}`)
  logger.info(`Source File: ${csvFile}`)
  logger.info(`Target Currency: ${targetCurrency.toUpperCase()}`)
  logger.info(`Target Classification: ${targetClassification}`)
  logger.info(`Allow Overwrite: ${allowOverwrite}`)

  if (apply && csvFile !== "approved-production-usd-prices.csv" && !fileArg) {
    logger.error("When --apply is used, you must import the approved-production-usd-prices.csv file.")
    process.exit(1)
  }

  const resolvedPath = path.resolve(process.cwd(), csvFile)
  if (!fs.existsSync(resolvedPath)) {
    logger.error(`CSV file not found at: ${resolvedPath}`)
    process.exit(1)
  }

  const csvContent = fs.readFileSync(resolvedPath, "utf8")
  const lines = csvContent.split("\n").map((line) => line.trim()).filter(Boolean)

  if (lines.length <= 1) {
    logger.warn("No rows found in CSV.")
    return
  }

  const parseCsvRow = (text: string) => {
    const result: string[] = []
    let insideQuote = false
    let entry = ""
    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      if (char === '"') {
        if (insideQuote && text[i + 1] === '"') {
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
    return result.map(val => val.replace(/^"|"$/g, "").trim())
  }

  // Parse CSV headers
  const headers = parseCsvRow(lines[0]).map((header) =>
    header.replace(/^\uFEFF/, "").trim().toLowerCase()
  )
  const rows = lines.slice(1)

  let createdCount = 0
  let skippedCount = 0
  let invalidCount = 0
  let failedCount = 0

  const errorsList: any[] = []
  const processedVariants = new Set<string>()

  // First Pass: Validate all rows structurally before applying
  const validRowsList: any[] = []
  for (const rowText of rows) {
    const cols = parseCsvRow(rowText)
    if (cols.length < headers.length) {
      invalidCount++
      continue
    }

    const row = Object.fromEntries(
      headers.map((header, index) => [
        header,
        String(cols[index] ?? "").trim(),
      ])
    )

    const variantId = row.variant_id
    const currency = row.currency_code?.toLowerCase()
    const classification = row.classification
    const action = row.action?.toUpperCase()

    let amountStr = ""
    if (targetCurrency === "usd") {
      amountStr = row.usd_amount || row.amount || row.suggested_amount
    } else if (targetCurrency === "cad") {
      amountStr = row.cad_amount || row.amount || row.suggested_amount
    }

    if (!variantId || !currency) {
      logger.error(`Validation failed: missing variant_id or currency_code: ${rowText}`)
      invalidCount++
      continue
    }

    // Task 8 Guard: Reject action other than CREATE
    if (action !== "CREATE") {
      logger.error(`Validation failed: action must be CREATE: ${rowText}`)
      invalidCount++
      continue
    }

    // Task 8 Guard: Reject classification other than PRODUCTION_STOREFRONT
    if (classification !== "PRODUCTION_STOREFRONT") {
      logger.error(`Validation failed: classification must be PRODUCTION_STOREFRONT: ${rowText}`)
      invalidCount++
      continue
    }

    // Task 8 Guard: Reject currency other than target currency
    if (currency !== targetCurrency) {
      logger.error(`Validation failed: currency mismatch, expected ${targetCurrency}: ${rowText}`)
      invalidCount++
      continue
    }

    const amount = Number(amountStr)
    // Task 8 Guard: Validate integer minor units and positive amount
    if (isNaN(amount) || amount <= 0 || !Number.isInteger(amount)) {
      logger.error(`Validation failed: amount must be a positive integer in minor units: ${rowText}`)
      invalidCount++
      continue
    }

    // Task 8 Guard: Reject duplicate variant/currency rows in the CSV
    const key = `${variantId}-${currency}`
    if (processedVariants.has(key)) {
      logger.error(`Validation failed: duplicate variant price row in CSV: ${rowText}`)
      invalidCount++
      continue
    }
    processedVariants.add(key)

    validRowsList.push({ variantId, currency, amount, row })
  }

  // Task 8 Guard: Reject if there are invalid rows
  if (invalidCount > 0) {
    logger.error(`Validation phase failed with ${invalidCount} invalid rows. Aborting import.`)
    process.exit(1)
  }

  // Confirmation Summary
  logger.info("\n=== IMPORT CONFIRMATION SUMMARY ===")
  logger.info(`Total valid rows to process: ${validRowsList.length}`)
  logger.info(`Mode: ${apply ? "APPLY (Database writes enabled)" : "DRY RUN (Simulated)"}`)
  logger.info(`Currency: ${targetCurrency.toUpperCase()}`)
  logger.info(`Classification: ${targetClassification}`)
  logger.info("===================================\n")

  // Second Pass: Process DB reads/writes
  for (const item of validRowsList) {
    const { variantId, currency, amount, row } = item

    try {
      // Query variant to verify existence
      const { data: variants } = await query.graph({
        entity: "product_variant",
        fields: ["id", "title", "prices.id", "prices.amount", "prices.currency_code", "prices.price_set_id", "price_set.id"],
        filters: { id: variantId },
      })

      const variant = variants?.[0]
      if (!variant) {
        logger.error(`Variant '${variantId}' not found in database.`)
        failedCount++
        logger.info(`[REGION_PRICE_IMPORT_ROW] ${JSON.stringify({ variantId, currencyCode: currency, amount, action: "CREATE", result: "FAILED" })}`)
        continue
      }
      const pricedVariant = variant as typeof variant & {
        prices?: SelectedVariantPrice[]
        price_set?: SelectedVariantPriceSet
      }

      // Check existing price
      const existingPrice = (pricedVariant.prices || []).find(
        (p: any) => p.currency_code?.toLowerCase() === currency
      )

      if (existingPrice) {
        // Task 8 Guard: Reject existing USD price if overwrite is disabled
        if (!allowOverwrite) {
          logger.error(`Price for variant ${variantId} in ${currency.toUpperCase()} already exists (overwrite blocked).`)
          skippedCount++
          logger.info(`[REGION_PRICE_IMPORT_ROW] ${JSON.stringify({ variantId, currencyCode: currency, amount, action: "CREATE", result: "SKIPPED" })}`)
          continue
        }

        // Apply Update
        if (dryRun) {
          createdCount++
          logger.info(`[REGION_PRICE_IMPORT_ROW] ${JSON.stringify({ variantId, currencyCode: currency, amount, action: "CREATE", result: "CREATED" })}`)
        } else {
          await pricingModuleService.updatePrices([
            {
              id: existingPrice.id,
              amount: amount,
            },
          ])
          createdCount++
          logger.info(`[REGION_PRICE_IMPORT_ROW] ${JSON.stringify({ variantId, currencyCode: currency, amount, action: "CREATE", result: "CREATED" })}`)
        }
      } else {
        // Resolve Price Set ID
        let priceSetId = pricedVariant.price_set?.id || (pricedVariant.prices || []).find((p) => p.price_set_id)?.price_set_id

        if (!priceSetId) {
          const { data: links } = await query.graph({
            entity: "product_variant_price_set",
            fields: ["variant_id", "price_set_id"],
            filters: { variant_id: variant.id },
          })
          const linkMatch = (links || []).find((l: { price_set_id?: string }) => l.price_set_id)
          priceSetId = linkMatch?.price_set_id
        }

        if (!priceSetId) {
          failedCount++
          logger.info(`[REGION_PRICE_IMPORT_ROW] ${JSON.stringify({ variantId, currencyCode: currency, amount, action: "CREATE", result: "FAILED" })}`)
          errorsList.push({ variantId, message: "No price set resolved" })
          continue
        }

        // Apply Create
        if (dryRun) {
          createdCount++
          logger.info(`[REGION_PRICE_IMPORT_ROW] ${JSON.stringify({ variantId, currencyCode: currency, amount, action: "CREATE", result: "CREATED" })}`)
        } else {
          await pricingModuleService.createPrices([
            {
              price_set_id: priceSetId,
              currency_code: currency,
              amount: amount,
            },
          ])
          createdCount++
          logger.info(`[REGION_PRICE_IMPORT_ROW] ${JSON.stringify({ variantId, currencyCode: currency, amount, action: "CREATE", result: "CREATED" })}`)
        }
      }
    } catch (error: any) {
      failedCount++
      logger.info(`[REGION_PRICE_IMPORT_ROW] ${JSON.stringify({ variantId, currencyCode: currency, amount, action: "CREATE", result: "FAILED" })}`)
      errorsList.push({ variantId, message: error.message })
    }
  }

  logger.info("\n[REGION_PRICE_IMPORT_DONE]")
  logger.info(
    JSON.stringify(
      {
        mode: dryRun ? "DRY_RUN" : "APPLY",
        total: validRowsList.length,
        created: createdCount,
        skipped: skippedCount,
        invalid: invalidCount,
        failed: failedCount
      },
      null,
      2
    )
  )

  if (failedCount > 0 && !dryRun) {
    process.exit(1)
  }
}
