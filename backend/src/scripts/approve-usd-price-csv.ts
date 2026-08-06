import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"

export default async function approveUsdPriceCsv({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  logger.info("[APPROVE_USD_CSV_START]")

  const reviewedPath = path.resolve(process.cwd(), "reviewed-production-usd-prices.csv")
  const approvedPath = path.resolve(process.cwd(), "approved-production-usd-prices.csv")

  if (!fs.existsSync(reviewedPath)) {
    logger.error(`Reviewed CSV file not found at: ${reviewedPath}`)
    process.exit(1)
  }

  const csvContent = fs.readFileSync(reviewedPath, "utf8")
  const lines = csvContent.split("\n").map((line) => line.trim()).filter(Boolean)

  if (lines.length <= 1) {
    logger.warn("No rows found in Reviewed CSV.")
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

  const headers = parseCsvRow(lines[0]).map((header) =>
    header.replace(/^\uFEFF/, "").trim().toLowerCase()
  )

  const rows = lines.slice(1)
  const approvedRows: string[] = [lines[0]] // Keep header

  let totalReviewedRows = 0
  let approvedRowsCount = 0
  let skippedRowsCount = 0
  let invalidRowsCount = 0

  let diagnosticLogged = false

  for (const rowText of rows) {
    const values = parseCsvRow(rowText)
    if (values.length < headers.length) {
      invalidRowsCount++
      continue
    }

    const row = Object.fromEntries(
      headers.map((header, index) => [
        header,
        String(values[index] ?? "").trim(),
      ])
    )

    totalReviewedRows++

    const action = String(row.action ?? "").trim().toUpperCase()
    const classification = String(row.classification ?? "").trim().toUpperCase()
    const currency = String(row.currency_code ?? "").trim().toLowerCase()
    const usdAmount = Number(row.usd_amount)

    if (!diagnosticLogged) {
      logger.info("\n[APPROVE_USD_CSV_DIAGNOSTIC]")
      logger.info(JSON.stringify({
        parsedHeaders: headers,
        firstRowAction: action,
        firstRowClassification: classification,
        firstRowCurrency: currency
      }, null, 2))
      diagnosticLogged = true
    }

    const isValid =
      row.product_id !== "" &&
      row.variant_id !== "" &&
      classification === "PRODUCTION_STOREFRONT" &&
      currency === "usd" &&
      Number.isInteger(usdAmount) &&
      usdAmount > 0

    if (!isValid) {
      invalidRowsCount++
      continue
    }

    if (action === "CREATE") {
      approvedRows.push(rowText)
      approvedRowsCount++
    } else if (action === "SKIP" || action === "REVIEW") {
      skippedRowsCount++
    } else {
      invalidRowsCount++
    }
  }

  fs.writeFileSync(approvedPath, approvedRows.join("\n"), "utf8")

  logger.info("\n[APPROVE_USD_CSV_DONE]")
  logger.info(JSON.stringify({
    totalReviewedRows,
    approvedRowsCount,
    skippedRowsCount,
    invalidRowsCount
  }, null, 2))
}
