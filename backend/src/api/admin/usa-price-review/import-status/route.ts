import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getImportResult } from "../lib/import-ledger"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const idempotencyKey = String(req.query.idempotency_key ?? "").trim()
  if (!idempotencyKey.startsWith("usa-price-import-dry_")) {
    return res.status(400).json({ message: "A valid idempotency_key is required.", code: "INVALID_IDEMPOTENCY_KEY" })
  }
  const entry = getImportResult(idempotencyKey)
  if (!entry) {
    return res.status(404).json({ message: "No completed import was found for that key.", code: "IMPORT_STATUS_NOT_FOUND" })
  }
  return res.json({ ...entry.result, idempotent_replay: true })
}
