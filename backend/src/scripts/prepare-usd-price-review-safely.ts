import * as fs from "fs"
import * as path from "path"

const REVIEW_CSV = path.resolve(process.cwd(), "reports", "usa-missing-usd-price-review.csv")
const VALIDATION_JSON = path.resolve(process.cwd(), "reports", "usa-missing-usd-price-review-preapproval-validation.json")
const HUMAN_REVIEW_CSV = path.resolve(process.cwd(), "reports", "usa-usd-price-human-review-summary.csv")
const HUMAN_REVIEW_INSTRUCTIONS = path.resolve(process.cwd(), "reports", "usa-usd-price-human-review-instructions.md")

const REVIEW_HEADERS = [
  "product_id",
  "product_handle",
  "product_title",
  "variant_id",
  "variant_title",
  "sku",
  "current_cad_amount",
  "current_cad_currency",
  "existing_usd_amount",
  "proposed_usd_amount",
  "proposal_source",
  "review_status",
  "validation_error",
  "notes",
]

const HUMAN_REVIEW_HEADERS = [
  "product_id",
  "product_handle",
  "product_title",
  "variant_id",
  "variant_title",
  "sku",
  "current_cad_amount",
  "proposed_usd_amount",
  "review_status",
  "notes",
]

const APPROVED_SOURCE_CANDIDATES = [
  {
    file: path.resolve(process.cwd(), "reports", "merchant-approved-regional-prices.csv"),
    name: "reports/merchant-approved-regional-prices.csv",
    amountField: "approved_usd_price",
    statusField: "approval_status",
    approvedValue: "approved",
  },
  {
    file: path.resolve(process.cwd(), "reports", "merchant-storefront-price-remediation.csv"),
    name: "reports/merchant-storefront-price-remediation.csv",
    amountField: "approved_usd_price",
    statusField: "approval_status",
    approvedValue: "approved",
  },
  {
    file: path.resolve(process.cwd(), "approved-production-usd-prices.csv"),
    name: "approved-production-usd-prices.csv",
    amountField: "usd_amount",
    statusField: "action",
    approvedValue: "create",
  },
]

const REJECTED_SOURCE_CANDIDATES = [
  {
    file: path.resolve(process.cwd(), "reviewed-production-usd-prices.csv"),
    name: "reviewed-production-usd-prices.csv",
    amountField: "usd_amount",
    reason: "reviewed conversion source is not an approved major-unit merchant source for this CSV",
  },
  {
    file: path.resolve(process.cwd(), "reports", "storefront-regional-price-merchant-review.csv"),
    name: "reports/storefront-regional-price-merchant-review.csv",
    amountField: "approved_usd",
    reason: "merchant review rows are not marked approved",
  },
]

type Row = Record<string, string>
type Match = {
  sourceFile: string
  sourceRow: number
  amount: string
  matchMethod: string
  confidence: "high" | "rejected" | "ambiguous"
  validationResult: string
  reason?: string
}

function parseCsvLine(line: string) {
  const result: string[] = []
  let entry = ""
  let quoted = false
  for (let index = 0; index < line.length; index++) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        entry += '"'
        index++
      } else {
        quoted = !quoted
      }
    } else if (character === "," && !quoted) {
      result.push(entry)
      entry = ""
    } else {
      entry += character
    }
  }
  result.push(entry)
  return result
}

function parseCsv(filePath: string): Row[] {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) return []
  const headers = parseCsvLine(lines[0]).map((header) => header.trim().replace(/^"|"$/g, "").toLowerCase())
  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line).map((value) => value.replace(/^"|"$/g, "").replace(/""/g, '"').trim())
    return {
      row_number: String(index + 2),
      ...Object.fromEntries(headers.map((header, valueIndex) => [header, String(values[valueIndex] ?? "").trim()])),
    }
  })
}

function csvEscape(value: unknown) {
  const text = String(value ?? "")
  const escaped = text.replace(/"/g, '""')
  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped
}

function writeCsv(filePath: string, headers: string[], rows: Row[]) {
  fs.writeFileSync(
    filePath,
    [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join("\n") + "\n",
    "utf8"
  )
}

function validMajorUsdAmount(value: string) {
  return /^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value) && Number(value) > 0
}

function normalizedTitle(value: string) {
  return String(value || "").trim().toLowerCase()
}

function isSameProductVariant(review: Row, candidate: Row) {
  if (review.variant_id && candidate.variant_id === review.variant_id) return "variant_id"
  if (review.sku && candidate.sku === review.sku) return "sku"
  if (
    review.product_id &&
    candidate.product_id === review.product_id &&
    normalizedTitle(candidate.variant_title) === normalizedTitle(review.variant_title)
  ) {
    return "product_id + variant title"
  }
  if (
    review.product_handle &&
    candidate.product_handle === review.product_handle &&
    normalizedTitle(candidate.variant_title) === normalizedTitle(review.variant_title)
  ) {
    return "product_handle + variant title"
  }
  return ""
}

function findApprovedMatches(review: Row) {
  const matches: Match[] = []
  for (const source of APPROVED_SOURCE_CANDIDATES) {
    if (!fs.existsSync(source.file)) continue
    const rows = parseCsv(source.file)
    rows.forEach((candidate) => {
      const matchMethod = isSameProductVariant(review, candidate)
      if (!matchMethod) return
      const amount = String(candidate[source.amountField] || "").trim()
      const status = String(candidate[source.statusField] || "").trim().toLowerCase()
      if (status !== source.approvedValue || !amount) return
      matches.push({
        sourceFile: source.name,
        sourceRow: Number(candidate.row_number),
        amount,
        matchMethod,
        confidence: validMajorUsdAmount(amount) ? "high" : "ambiguous",
        validationResult: validMajorUsdAmount(amount) ? "PASS" : "amount is not valid major-unit USD",
      })
    })
  }
  return matches
}

function findRejectedMatches(review: Row) {
  const matches: Match[] = []
  for (const source of REJECTED_SOURCE_CANDIDATES) {
    if (!fs.existsSync(source.file)) continue
    const rows = parseCsv(source.file)
    rows.forEach((candidate) => {
      const matchMethod = isSameProductVariant(review, candidate)
      if (!matchMethod) return
      const amount = String(candidate[source.amountField] || "").trim()
      matches.push({
        sourceFile: source.name,
        sourceRow: Number(candidate.row_number),
        amount,
        matchMethod,
        confidence: "rejected",
        validationResult: "REJECTED",
        reason: source.reason,
      })
    })
  }
  return matches
}

function main() {
  if (!fs.existsSync(REVIEW_CSV)) throw new Error(`Review CSV not found: ${REVIEW_CSV}`)
  fs.mkdirSync(path.dirname(VALIDATION_JSON), { recursive: true })

  const reviewRows = parseCsv(REVIEW_CSV)
  const updatedRows: Row[] = []
  const duplicateVariantIds = new Set<string>()
  const seenVariantIds = new Set<string>()
  const sourceFilesUsed = new Set<string>()
  const approvedMatches: Array<{ row: Row; match: Match }> = []
  const rejectedMatches: Array<{ row: Row; matches: Match[] }> = []
  const ambiguousMatches: Array<{ row: Row; matches: Match[] }> = []
  const invalidRows: Array<Record<string, unknown>> = []

  for (const row of reviewRows) {
    if (row.variant_id) {
      if (seenVariantIds.has(row.variant_id)) duplicateVariantIds.add(row.variant_id)
      seenVariantIds.add(row.variant_id)
    }

    const approved = findApprovedMatches(row)
    const rejected = findRejectedMatches(row)
    const highConfidence = approved.filter((match) => match.confidence === "high")
    const ambiguous = approved.filter((match) => match.confidence !== "high")

    const updated = { ...row }
    if (highConfidence.length === 1) {
      const match = highConfidence[0]
      updated.proposed_usd_amount = match.amount
      updated.proposal_source = match.sourceFile
      updated.review_status = "APPROVED"
      updated.validation_error = ""
      updated.notes = `${match.sourceFile} row ${match.sourceRow}; match=${match.matchMethod}; confidence=high`
      sourceFilesUsed.add(match.sourceFile)
      approvedMatches.push({ row, match })
    } else {
      updated.proposed_usd_amount = ""
      updated.proposal_source = "none_available"
      updated.review_status = "NEEDS_REVIEW"
      updated.validation_error = ""
      updated.notes = "Merchant USD price required"
      if (highConfidence.length > 1 || ambiguous.length > 0) {
        ambiguousMatches.push({ row: updated, matches: [...highConfidence, ...ambiguous] })
      }
    }

    if (rejected.length) {
      rejectedMatches.push({ row: updated, matches: rejected })
    }

    updatedRows.push(updated)
  }

  for (const row of updatedRows) {
    const errors: string[] = []
    if (!["APPROVED", "NEEDS_REVIEW", "REJECTED"].includes(row.review_status)) errors.push("invalid review_status")
    if (row.review_status === "APPROVED") {
      if (!validMajorUsdAmount(row.proposed_usd_amount)) errors.push("approved amount is not a positive major-unit USD decimal")
      if (!row.notes || row.notes === "Merchant USD price required") errors.push("approved row is missing source note")
      if (row.existing_usd_amount) errors.push("approved row would duplicate existing USD amount")
    }
    if (errors.length) {
      invalidRows.push({ rowNumber: row.row_number, productId: row.product_id, variantId: row.variant_id, errors })
    }
  }

  writeCsv(REVIEW_CSV, REVIEW_HEADERS, updatedRows)
  writeCsv(
    HUMAN_REVIEW_CSV,
    HUMAN_REVIEW_HEADERS,
    updatedRows.filter((row) => row.review_status === "NEEDS_REVIEW")
  )

  fs.writeFileSync(
    HUMAN_REVIEW_INSTRUCTIONS,
    [
      "# USA USD Price Human Review Instructions",
      "",
      "- Prices are major USD units.",
      "- `18.99` means `$18.99`.",
      "- Edit only `proposed_usd_amount` and `review_status` in the review CSV.",
      "- Set `review_status` to `APPROVED` only after merchant confirmation.",
      "- Do not change product IDs, variant IDs, SKUs, product titles, variant titles, CAD amounts, or existing USD amounts.",
      "- Do not use CAD conversion unless it is explicitly approved by the merchant.",
      "- Do not use zero, negative, placeholder, guessed, rounded, or copied CAD prices.",
      "- Leave rows as `NEEDS_REVIEW` until the merchant supplies an explicit USD price.",
      "",
    ].join("\n"),
    "utf8"
  )

  const validation = {
    reviewCsv: "reports/usa-missing-usd-price-review.csv",
    totalRows: updatedRows.length,
    rowsAutoApprovedFromVerifiedSource: approvedMatches.length,
    rowsStillNeedingMerchantReview: updatedRows.filter((row) => row.review_status === "NEEDS_REVIEW").length,
    rejectedSourceMatches: rejectedMatches.reduce((count, item) => count + item.matches.length, 0),
    rejectedRowsWithSourceMatches: rejectedMatches.length,
    ambiguousMatches: ambiguousMatches.length,
    duplicateRows: duplicateVariantIds.size,
    invalidRows: invalidRows.length,
    priceUnit: "major",
    sourceFilesUsed: Array.from(sourceFilesUsed),
    approvedMatches,
    rejectedMatches,
    ambiguousMatchDetails: ambiguousMatches,
    duplicateVariantIds: Array.from(duplicateVariantIds),
    invalidRowDetails: invalidRows,
    liveImportExecuted: false,
    businessDataWrites: 0,
  }

  fs.writeFileSync(VALIDATION_JSON, JSON.stringify(validation, null, 2) + "\n", "utf8")
  console.log(JSON.stringify(validation, null, 2))
}

main()
