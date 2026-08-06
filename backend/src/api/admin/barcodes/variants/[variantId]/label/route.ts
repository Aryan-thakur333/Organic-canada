import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import bwipjs from "bwip-js"
import { type CatalogVariant, normalizeIdentifier, VARIANT_BARCODE_GRAPH_FIELDS } from "../../../../../../scripts/lib/variant-barcodes"

function xml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character] || character)
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const format = String(req.query.format || "svg").toLowerCase()
  if (!['png', 'svg'].includes(format)) return res.status(400).json({ message: "format must be png or svg" })
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY) as { graph(input: Record<string, unknown>): Promise<{ data: CatalogVariant[] }> }
  const { data } = await query.graph({ entity: "variant", fields: [...VARIANT_BARCODE_GRAPH_FIELDS], filters: { id: req.params.variantId }, pagination: { take: 1 } })
  const variant = (data || [])[0]
  if (!variant?.product?.id) return res.status(404).json({ message: "Variant not found" })
  const labelMode = String(req.query.label_mode || "PRINT_STANDARD").toUpperCase()
  const isQrLabel = labelMode === "POS_QR"
  const barcode = isQrLabel ? `EATSIE-POS:${variant.id}` : normalizeIdentifier(variant.barcode || variant.upc || variant.ean)
  if (!barcode) return res.status(422).json({ message: "Variant has no printable identifier" })
  const includeSku = String(req.query.include_sku || "true") !== "false"
  const includePrice = String(req.query.include_price || "false") === "true"
  const includeText = String(req.query.include_text || "true") !== "false"
  const requestedCurrency = String(req.query.currency || "cad").toLowerCase()
  const price = (variant.prices || []).find((entry) => String(entry.currency_code).toLowerCase() === requestedCurrency)
  if (includePrice && !price) return res.status(422).json({ message: `No ${requestedCurrency.toUpperCase()} price is available for this label` })
  const storeName = String(process.env.STORE_NAME || "Eatsie")
  const width = boundedNumber(req.query.width, 50, 30, 100)
  const height = boundedNumber(req.query.height, 25, 15, 60)
  const details = [storeName, variant.product.title || "Product", variant.title || "Default", barcode, includeSku && variant.sku ? `SKU ${variant.sku}` : "", includePrice && price ? `${String(price.currency_code).toUpperCase()} ${Number(price.amount).toFixed(2)}` : ""].filter(Boolean)

  const isScannerOptimized = labelMode === "SCANNER_OPTIMIZED"
  const options = isQrLabel
    ? { bcid: "qrcode", text: barcode, scale: 6, eclevel: "M" as const, backgroundcolor: "FFFFFF", paddingwidth: 12, paddingheight: 12 }
    : isScannerOptimized
    ? { bcid: "code128", text: barcode, scale: 4, height: 40, backgroundcolor: "FFFFFF", paddingwidth: 20, paddingheight: 10, includetext: false }
    : { bcid: "code128", text: barcode, scale: 3, height: Math.max(8, height - 12), includetext: true, textxalign: "center" as const, paddingwidth: 4, paddingheight: 2, alttext: details.join(" | ") }

  const filename = `barcode-${variant.id.replace(/[^A-Za-z0-9_-]/g, "")}.${format}`
  res.setHeader("Cache-Control", "private, no-store")
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`)
  if (format === "png") {
    const buffer = await bwipjs.toBuffer(options)
    res.setHeader("Content-Type", "image/png")
    return res.send(buffer)
  }
  const barcodeSvg = bwipjs.toSVG(options)
  const printedDate = String(req.query.include_date || "false") === "true" ? new Date().toISOString().slice(0, 10) : ""

  let svg: string
  if (isQrLabel) {
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 600 300" role="img" aria-label="${xml(details.join(" "))}"><rect width="600" height="300" fill="white"/><text x="300" y="28" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="700">${xml(storeName)}</text><text x="300" y="53" text-anchor="middle" font-family="Arial,sans-serif" font-size="16">${xml(variant.product.title)}</text><text x="300" y="74" text-anchor="middle" font-family="Arial,sans-serif" font-size="13">${xml(variant.title || "Default")}</text><svg x="215" y="86" width="170" height="170" preserveAspectRatio="xMidYMid meet">${barcodeSvg}</svg><text x="30" y="278" font-family="Arial,sans-serif" font-size="12">${includeSku ? xml(`SKU ${variant.sku || "—"}`) : ""}</text><text x="570" y="278" text-anchor="end" font-family="Arial,sans-serif" font-size="12">${includeText ? xml(barcode) : xml(printedDate)}</text></svg>`
  } else if (isScannerOptimized) {
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300" viewBox="0 0 800 300" fill="white" role="img" aria-label="${xml(details.join(" "))}"><rect width="800" height="300" fill="white"/><text x="400" y="35" text-anchor="middle" font-family="Arial,sans-serif" font-size="20" font-weight="700" fill="black">${xml(storeName)} - ${xml(variant.product.title)} (${xml(variant.title)})</text><svg x="80" y="55" width="640" height="180" preserveAspectRatio="xMidYMid meet">${barcodeSvg}</svg>${includeText ? `<text x="400" y="260" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" fill="black">${xml(barcode)}</text>` : ""}<text x="40" y="285" font-family="Arial,sans-serif" font-size="12" fill="black">${includeSku ? xml(`SKU ${variant.sku || "—"}`) : ""}</text><text x="760" y="285" text-anchor="end" font-family="Arial,sans-serif" font-size="12" fill="black">${includePrice && price ? xml(`${String(price.currency_code).toUpperCase()} ${Number(price.amount).toFixed(2)}`) : xml(printedDate)}</text></svg>`
  } else {
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 600 300" role="img" aria-label="${xml(details.join(" "))}"><rect width="600" height="300" fill="white"/><text x="300" y="28" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="700">${xml(storeName)}</text><text x="300" y="53" text-anchor="middle" font-family="Arial,sans-serif" font-size="16">${xml(variant.product.title)}</text><text x="300" y="74" text-anchor="middle" font-family="Arial,sans-serif" font-size="13">${xml(variant.title || "Default")}</text><svg x="45" y="82" width="510" height="160" preserveAspectRatio="xMidYMid meet">${barcodeSvg}</svg><text x="30" y="278" font-family="Arial,sans-serif" font-size="12">${includeSku ? xml(`SKU ${variant.sku || "—"}`) : ""}</text><text x="570" y="278" text-anchor="end" font-family="Arial,sans-serif" font-size="12">${includePrice && price ? xml(`${String(price.currency_code).toUpperCase()} ${Number(price.amount).toFixed(2)}`) : xml(printedDate)}</text></svg>`
  }

  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8")
  return res.send(svg)
}
