import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getImportResult, type ImportRowResult } from "../lib/import-ledger"

type QueryLike = { graph(input: Record<string, unknown>): Promise<{ data?: unknown[] }> }
type ApiKeyRecord = { token?: string; type?: string; title?: string }
type RegionRecord = {
  id?: string
  currency_code?: string
  countries?: Array<{ iso_2?: string }>
}
type StoreVariant = {
  id?: string
  calculated_price?: { calculated_amount?: number; currency_code?: string }
}
type StoreProduct = { id?: string; variants?: StoreVariant[] }

async function responseJson<T>(response: Response): Promise<T> {
  return await response.json() as T
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const body = req.body as { idempotency_key?: string }
    const idempotencyKey = String(body?.idempotency_key ?? "").trim()
    const ledgerEntry = getImportResult(idempotencyKey)
    if (!ledgerEntry) {
      return res.status(404).json({ message: "Import result not found.", code: "IMPORT_STATUS_NOT_FOUND" })
    }

    const expectedRows = ledgerEntry.result.row_results.filter(
      (row): row is ImportRowResult => row.result === "IMPORTED" || row.result === "ALREADY_CORRECT",
    )
    if (expectedRows.length === 0) {
      return res.status(422).json({ message: "The import has no successful rows to verify.", code: "NO_IMPORTED_ROWS" })
    }

    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as unknown as QueryLike
    const { data } = await query.graph({
      entity: "api_key",
      fields: ["token", "type", "title"],
      filters: { type: "publishable" },
    })
    const keys = (data ?? []) as ApiKeyRecord[]
    const publishableKey = keys.find((key) => key.title === "Default Publishable API Key")?.token ?? keys[0]?.token
    if (!publishableKey) {
      return res.status(500).json({ message: "Store API verification key is unavailable.", code: "STORE_KEY_UNAVAILABLE" })
    }

    const baseUrl = (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
    const headers = { "x-publishable-api-key": publishableKey }
    const regionsResponse = await fetch(`${baseUrl}/store/regions?limit=100`, { headers })
    if (!regionsResponse.ok) {
      return res.status(502).json({ message: `Store regions request returned HTTP ${regionsResponse.status}.`, code: "STORE_API_FAILED" })
    }
    const regionsPayload = await responseJson<{ regions?: RegionRecord[] }>(regionsResponse)
    const usaRegion = (regionsPayload.regions ?? []).find((region) =>
      region.currency_code?.toLowerCase() === "usd" &&
      (region.countries ?? []).some((country) => country.iso_2?.toLowerCase() === "us"),
    )
    if (!usaRegion?.id) {
      return res.status(422).json({ message: "A USD region containing country US was not found.", code: "USA_REGION_NOT_FOUND" })
    }

    const productsById = new Map<string, StoreProduct>()
    const storeStatuses: number[] = []
    let offset = 0
    let count = Number.POSITIVE_INFINITY
    while (offset < count) {
      const url = new URL(`${baseUrl}/store/products`)
      url.searchParams.set("limit", "100")
      url.searchParams.set("offset", String(offset))
      url.searchParams.set("region_id", usaRegion.id)
      url.searchParams.set("country_code", "us")
      url.searchParams.set("fields", "id,title,variants.id,variants.calculated_price.*")
      const response = await fetch(url, { headers })
      storeStatuses.push(response.status)
      if (!response.ok) {
        return res.status(502).json({ message: `Store products request returned HTTP ${response.status}.`, code: "STORE_API_FAILED" })
      }
      const payload = await responseJson<{ products?: StoreProduct[]; count?: number }>(response)
      const page = payload.products ?? []
      count = Number(payload.count ?? page.length)
      for (const product of page) {
        if (product.id) productsById.set(product.id, product)
      }
      if (page.length === 0) break
      offset += page.length
    }

    const rowResults = expectedRows.map((expected) => {
      const product = productsById.get(expected.product_id)
      const variant = product?.variants?.find((entry) => entry.id === expected.variant_id)
      const calculated = variant?.calculated_price
      const actualAmount = Number(calculated?.calculated_amount)
      const currency = String(calculated?.currency_code ?? "").toLowerCase()
      const verified = Boolean(variant) && currency === "usd" && actualAmount === expected.requested_usd
      return {
        product_id: expected.product_id,
        variant_id: expected.variant_id,
        requested_usd: expected.requested_usd,
        storefront_usd: Number.isFinite(actualAmount) ? actualAmount : null,
        currency_code: currency || null,
        verified,
        message: verified ? "Store API calculated USD amount matches." : "Store API did not return the expected calculated USD amount.",
      }
    })
    const verified = rowResults.filter((row) => row.verified).length
    const failed = rowResults.length - verified
    return res.json({
      status: failed === 0 ? "PASS" : "FAIL",
      import_id: ledgerEntry.result.import_id,
      verified,
      failed,
      region_id: usaRegion.id,
      country_code: "us",
      currency_code: "usd",
      store_statuses: storeStatuses,
      row_results: rowResults,
    })
  } catch (error: unknown) {
    console.error("[USA_PRICE_REVIEW] storefront verification error:", error)
    return res.status(500).json({ message: "Store API verification failed.", code: "STORE_VERIFICATION_FAILED" })
  }
}
