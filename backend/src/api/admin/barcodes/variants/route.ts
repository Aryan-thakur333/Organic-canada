import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { buildAuditRows, type CatalogVariant, normalizeIdentifier, VARIANT_BARCODE_GRAPH_FIELDS } from "../../../../scripts/lib/variant-barcodes"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as { graph(input: Record<string, unknown>): Promise<{ data: CatalogVariant[] }> }
  const { data } = await query.graph({ entity: "variant", fields: [...VARIANT_BARCODE_GRAPH_FIELDS], pagination: { take: 10000 } })
  const rows = buildAuditRows(data || [])
  const q = String(req.query.q || "").trim().toLowerCase()
  const missingOnly = String(req.query.missing_barcode || "") === "true"
  const barcodeCounts = new Map<string, number>()
  for (const variant of data || []) {
    const barcode = normalizeIdentifier(variant.barcode)
    if (barcode) barcodeCounts.set(barcode, (barcodeCounts.get(barcode) || 0) + 1)
  }
  const rowById = new Map(rows.map((row) => [row.variant_id, row]))
  const variants = (data || []).map((variant) => {
    const audit = rowById.get(variant.id)
    const barcode = normalizeIdentifier(variant.barcode)
    const metadata = variant.metadata || {}
    const inventory = (variant.inventory_items || []).flatMap((item) => item.inventory?.location_levels || []).map((level) => ({ location_id: level.location_id, stocked_quantity: Number(level.stocked_quantity || 0), reserved_quantity: Number(level.reserved_quantity || 0), available_quantity: Math.max(0, Number(level.stocked_quantity || 0) - Number(level.reserved_quantity || 0)) }))
    return {
      product_id: variant.product?.id,
      product_title: variant.product?.title,
      product_status: variant.product?.status,
      variant_id: variant.id,
      variant_title: variant.title,
      sku: normalizeIdentifier(variant.sku),
      barcode,
      pos_qr_payload: `EATSIE-POS:${variant.id}`,
      upc: normalizeIdentifier(variant.upc),
      ean: normalizeIdentifier(variant.ean),
      pos_eligible: audit?.pos_sales_channel_linked === "true",
      classification: audit?.classification,
      suggested_internal_barcode: audit?.suggested_internal_barcode,
      duplicate_barcode: Boolean(barcode && Number(barcodeCounts.get(barcode) || 0) > 1),
      identifier_type: variant.upc || variant.ean ? "OFFICIAL_RETAIL" : barcode ? "INTERNAL_CODE128" : "UNASSIGNED",
      last_barcode_update: String(metadata.barcode_updated_at || ""),
      vendor_name: variant.product?.vendor?.name || "",
      prices: variant.prices || [],
      inventory,
    }
  }).filter((variant) => !missingOnly || !variant.barcode).filter((variant) => !q || [variant.product_title, variant.variant_title, variant.sku, variant.barcode, variant.upc, variant.ean].some((value) => String(value || "").toLowerCase().includes(q))).slice(0, 500)
  return res.json({ variants, summary: { total: (data || []).length, returned: variants.length, missing_barcode: (data || []).filter((variant) => !normalizeIdentifier(variant.barcode)).length, duplicate_barcodes: [...barcodeCounts.values()].filter((count) => count > 1).length } })
}
