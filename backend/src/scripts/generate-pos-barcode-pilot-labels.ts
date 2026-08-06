import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import bwipjs from "bwip-js"
import * as fs from "fs"
import * as path from "path"
import { readPilotApprovalCsv } from "./lib/pos-barcode-pilot"
import { normalizeIdentifier, type CatalogVariant, VARIANT_BARCODE_GRAPH_FIELDS } from "./lib/variant-barcodes"

const xml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character] || character)
const slug = (value: unknown) => String(value || "product").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "product"

export default async function generatePosBarcodePilotLabels({ container }: ExecArgs) {
  const approvalPath = path.resolve(process.cwd(), "reports", "pilot-pos-barcode-approvals.csv")
  const outputDir = path.resolve(process.cwd(), "reports", "barcode-labels", "pilot")
  const approvals = readPilotApprovalCsv(approvalPath).filter((row) => row.approved_action === "ASSIGN_INTERNAL_BARCODE")
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as { graph(input: Record<string, unknown>): Promise<{ data: CatalogVariant[] }> }
  const { data } = await query.graph({ entity: "variant", fields: [...VARIANT_BARCODE_GRAPH_FIELDS], filters: { id: approvals.map((row) => row.variant_id) }, pagination: { take: 100 } })
  const byId = new Map((data || []).map((variant) => [variant.id, variant]))
  fs.mkdirSync(outputDir, { recursive: true })
  let svgGenerated = 0
  let pngGenerated = 0
  const failures: Array<{ variantId: string; reason: string }> = []
  for (const row of approvals) {
    try {
      const variant = byId.get(row.variant_id)
      if (!variant?.product?.id) throw new Error("variant is missing")
      const barcode = normalizeIdentifier(variant.barcode)
      if (barcode !== row.approved_barcode) throw new Error("approved barcode is not applied")
      const price = variant.prices?.find((entry) => String(entry.currency_code).toLowerCase() === "cad")
      if (!price || Number(price.amount) <= 0) throw new Error("valid CAD price is missing")
      const details = [process.env.STORE_NAME || "Eatsie", variant.product.title || row.product_title, variant.title || row.variant_title || "Default", barcode, row.sku ? `SKU ${row.sku}` : "", `CAD ${Number(price.amount).toFixed(2)}`]
      const options = { bcid: "code128", text: barcode, scale: 3, height: 13, includetext: true, textxalign: "center" as const, paddingwidth: 4, paddingheight: 2, alttext: details.join(" | ") }
      const barcodeSvg = bwipjs.toSVG(options)
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="50mm" height="25mm" viewBox="0 0 600 300" role="img" aria-label="${xml(details.join(" "))}"><rect width="600" height="300" fill="white"/><text x="300" y="28" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="700">${xml(details[0])}</text><text x="300" y="53" text-anchor="middle" font-family="Arial,sans-serif" font-size="16">${xml(details[1])}</text><text x="300" y="74" text-anchor="middle" font-family="Arial,sans-serif" font-size="13">${xml(details[2])}</text><svg x="45" y="82" width="510" height="160" preserveAspectRatio="xMidYMid meet">${barcodeSvg}</svg><text x="30" y="278" font-family="Arial,sans-serif" font-size="12">${xml(details[4])}</text><text x="570" y="278" text-anchor="end" font-family="Arial,sans-serif" font-size="12">${xml(details[5])}</text></svg>`
      const base = `${slug(row.product_title)}-${row.variant_id.replace(/[^A-Za-z0-9_-]/g, "")}`
      const svgPath = path.join(outputDir, `${base}.svg`)
      const pngPath = path.join(outputDir, `${base}.png`)
      fs.writeFileSync(svgPath, svg, "utf8")
      const png = await bwipjs.toBuffer(options)
      fs.writeFileSync(pngPath, png)
      if (!svg.includes(barcode) || !svg.includes(xml(row.product_title)) || !svg.includes(xml(row.variant_title)) || (row.sku && !svg.includes(xml(row.sku)))) throw new Error("SVG human-readable details failed verification")
      if (png.length < 8 || png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("PNG signature validation failed")
      svgGenerated++; pngGenerated++
    } catch (error) {
      failures.push({ variantId: row.variant_id, reason: error instanceof Error ? error.message : String(error) })
    }
  }
  const marker = { labelsRequested: approvals.length, svgGenerated, pngGenerated, failed: failures.length, passed: approvals.length > 0 && svgGenerated === approvals.length && pngGenerated === approvals.length, outputDir, failures }
  console.log("[POS_BARCODE_LABEL_GENERATION]")
  console.log(JSON.stringify(marker, null, 2))
  if (!marker.passed) throw new Error("Pilot label generation failed")
}
