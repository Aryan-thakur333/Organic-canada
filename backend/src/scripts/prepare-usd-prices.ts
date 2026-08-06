import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"

export default async function prepareUsdPrices({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  logger.info("[USD_PRICE_PREPARATION_START]")

  // Parse CLI args
  const args = process.argv
  const fileArg = args.find((arg) => arg.startsWith("--file="))
  const csvFile = fileArg ? fileArg.split("=")[1] : "missing-production-usd-prices.csv"

  const rateArg = args.find((arg) => arg.startsWith("--rate="))
  if (!rateArg) {
    logger.error("Missing required parameter: --rate=<rate>")
    process.exit(1)
  }
  const rate = parseFloat(rateArg.split("=")[1])
  if (isNaN(rate) || rate <= 0) {
    logger.error(`Invalid rate parameter: ${rateArg}`)
    process.exit(1)
  }

  const roundingArg = args.find((arg) => arg.startsWith("--rounding="))
  const rounding = roundingArg ? roundingArg.split("=")[1].toUpperCase() : "NONE"

  const dryRun = args.includes("--dry-run")

  logger.info(`Source File: ${csvFile}`)
  logger.info(`Conversion Rate: ${rate}`)
  logger.info(`Rounding Strategy: ${rounding}`)
  logger.info(`Mode: ${dryRun ? "DRY RUN (Simulate conversions)" : "WRITE (Create reviewed-production-usd-prices.csv)"}`)

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

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase())
  const rows = lines.slice(1)

  // Append new metadata columns to the headers in the new output file
  const newHeaders = [...headers, "conversion_rate", "rounding_strategy", "prepared_at", "source"]
  const updatedRows: string[] = [newHeaders.join(",")]

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
    return result
  }

  const preparedAt = new Date().toISOString()
  const source = "MANUAL_MERCHANT_RATE"

  for (const rowText of rows) {
    const cols = parseCsvRow(rowText)
    if (cols.length < headers.length) continue

    const row: any = {}
    headers.forEach((h, index) => {
      row[h] = cols[index]
    })

    const productTitle = row.product_title
    const cadAmount = parseInt(row.cad_amount, 10)

    if (isNaN(cadAmount)) {
      continue
    }

    // Perform conversion in minor units
    const rawUsdAmount = Math.round(cadAmount * rate)
    let roundedUsdAmount = rawUsdAmount

    // Rounding Strategies
    if (rounding === "END_49") {
      const dollars = Math.floor(rawUsdAmount / 100)
      roundedUsdAmount = dollars * 100 + 49
      if (rawUsdAmount - roundedUsdAmount > 50) {
        roundedUsdAmount += 100
      } else if (roundedUsdAmount - rawUsdAmount > 50 && dollars > 0) {
        roundedUsdAmount -= 100
      }
    } else if (rounding === "END_99") {
      const dollars = Math.floor(rawUsdAmount / 100)
      roundedUsdAmount = dollars * 100 + 99
      if (rawUsdAmount - roundedUsdAmount > 50) {
        roundedUsdAmount += 100
      } else if (roundedUsdAmount - rawUsdAmount > 50 && dollars > 0) {
        roundedUsdAmount -= 100
      }
    } else if (rounding === "NEAREST_CENT") {
      roundedUsdAmount = Math.round(rawUsdAmount)
    }

    // Safety: ensure price is positive
    if (roundedUsdAmount <= 0) roundedUsdAmount = 1

    logger.info(
      JSON.stringify(
        {
          productTitle,
          cadAmount,
          rawUsdAmount,
          roundedUsdAmount,
          strategy: rounding,
        },
        null,
        2
      )
    )

    if (!dryRun) {
      row.usd_amount = String(roundedUsdAmount)
      row.action = "REVIEW" // Keep action=REVIEW as per Task 6 rules
      row.notes = `Converted using rate ${rate} and rounding ${rounding}`
      row.conversion_rate = String(rate)
      row.rounding_strategy = rounding
      row.prepared_at = preparedAt
      row.source = source

      const escapeCsv = (str: string) => {
        const clean = str.replace(/"/g, '""')
        return clean.includes(",") || clean.includes('"') ? `"${clean}"` : clean
      }

      const rebuiltRow = newHeaders
        .map((h) => {
          const val = row[h] || ""
          return h === "product_title" || h === "variant_title" || h === "notes"
            ? escapeCsv(val)
            : val
        })
        .join(",")
      updatedRows.push(rebuiltRow)
    }
  }

  if (!dryRun) {
    const outputPath = path.resolve(process.cwd(), "reviewed-production-usd-prices.csv")
    fs.writeFileSync(outputPath, updatedRows.join("\n"), "utf8")
    logger.info(`[USD_PRICE_PREPARATION_DONE] Converted USD prices written to: ${outputPath}`)
  } else {
    logger.info(`[USD_PRICE_PREPARATION_DONE] Simulation complete. No files written.`)
  }
}
