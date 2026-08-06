import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductVariantsWorkflow } from "@medusajs/core-flows"
import { POS_MODULE } from "../../../../../modules/pos"
import type PosModuleService from "../../../../../modules/pos/service"
import { type CatalogVariant, isPosEligible, isValidGtinChecksum, normalizeIdentifier, validateInternalBarcode, VARIANT_BARCODE_GRAPH_FIELDS } from "../../../../../scripts/lib/variant-barcodes"

type Body = { action?: string; value?: string; replacement_confirmation?: string }

export async function POST(req: MedusaRequest<Body>, res: MedusaResponse) {
  const variantId = String(req.params.variantId || "").trim()
  const action = String(req.body?.action || "")
  const value = normalizeIdentifier(req.body?.value)
  if (!variantId || variantId.length > 128) return res.status(400).json({ message: "Valid variantId is required" })
  const field = action === "ASSIGN_INTERNAL_BARCODE" ? "barcode" : action === "SET_OFFICIAL_UPC" ? "upc" : action === "SET_OFFICIAL_EAN" ? "ean" : null
  if (!field) return res.status(400).json({ message: "Unknown barcode action" })
  const errors = field === "barcode" ? validateInternalBarcode(value) : field === "upc" ? (isValidGtinChecksum(value, [12]) ? [] : ["UPC checksum is invalid"]) : (isValidGtinChecksum(value, [8, 13, 14]) ? [] : ["EAN checksum is invalid"])
  if (errors.length) return res.status(422).json({ message: errors.join("; ") })
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as { graph(input: Record<string, unknown>): Promise<{ data: CatalogVariant[] }> }
  const { data } = await query.graph({ entity: "variant", fields: [...VARIANT_BARCODE_GRAPH_FIELDS], pagination: { take: 10000 } })
  const variant = (data || []).find((entry) => entry.id === variantId)
  if (!variant?.product?.id) return res.status(404).json({ message: "Variant not found" })
  if (field === "barcode" && !isPosEligible(variant)) return res.status(409).json({ message: "Internal POS barcode requires a published POS-eligible variant" })
  const duplicate = (data || []).find((entry) => entry.id !== variantId && [entry.barcode, entry.upc, entry.ean].map(normalizeIdentifier).includes(value))
  if (duplicate) return res.status(409).json({ message: "Identifier is already assigned to another variant", duplicate_variant_id: duplicate.id })
  const existing = normalizeIdentifier(variant[field])
  if (existing === value) return res.json({ variant_id: variantId, field, value, status: "UNCHANGED" })
  if (existing && req.body?.replacement_confirmation !== "REPLACE_EXISTING_IDENTIFIER") return res.status(409).json({ message: `${field.toUpperCase()} already exists; explicit replacement confirmation is required` })
  const actorId = (req as MedusaRequest & { auth_context?: { actor_id?: string } }).auth_context?.actor_id || "unknown-admin"
  const timestamp = new Date().toISOString()
  await updateProductVariantsWorkflow(req.scope).run({ input: { product_variants: [{ id: variantId, [field]: value, metadata: { ...(variant.metadata || {}), barcode_identifier_type: field === "barcode" ? "INTERNAL_CODE128" : "OFFICIAL_RETAIL", barcode_updated_at: timestamp, barcode_updated_by: actorId } }] } })
  const posService = req.scope.resolve(POS_MODULE) as PosModuleService
  await posService.createPosAuditEvents({ operator_id: actorId, event_type: "ADMIN_VARIANT_IDENTIFIER_UPDATED", message: "Admin explicitly updated a product variant identifier", metadata: { product_id: variant.product.id, variant_id: variantId, field, identifier_type: field === "barcode" ? "INTERNAL_CODE128" : "OFFICIAL_RETAIL" } })
  return res.json({ variant_id: variantId, field, value, status: "UPDATED", updated_at: timestamp })
}
