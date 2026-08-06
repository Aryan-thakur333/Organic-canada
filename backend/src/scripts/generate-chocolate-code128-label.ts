import type { ExecArgs } from "@medusajs/framework/types"
import bwipjs from "bwip-js"
import * as fs from "fs"
import * as path from "path"
import {
  CHOCOLATE_BARCODE,
  CHOCOLATE_USD_PRICE,
  loadUsaPosChocolateInventorySnapshot,
} from "./lib/usa-pos-chocolate-inventory"

const xml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
})[character] || character)

export default async function generateChocolateCode128Label({ container }: ExecArgs) {
  const snapshot = await loadUsaPosChocolateInventorySnapshot(container)
  if (snapshot.barcode !== CHOCOLATE_BARCODE || snapshot.usdPrice !== CHOCOLATE_USD_PRICE) {
    throw new Error("Chocolate barcode/price snapshot changed; label generation blocked")
  }
  const outputDirectory = path.resolve(process.cwd(), "reports", "barcode-labels", "runtime")
  const base = "chocolate-standard-999999999-code128"
  const svgPath = path.join(outputDirectory, `${base}.svg`)
  const pngPath = path.join(outputDirectory, `${base}.png`)
  const details = ["Eatsie POS", snapshot.productTitle, snapshot.variantTitle, snapshot.barcode, `SKU ${snapshot.sku}`, `USD ${snapshot.usdPrice.toFixed(2)}`]
  const barcodeOptions = {
    bcid: "code128",
    text: snapshot.barcode,
    scale: 4,
    height: 22,
    includetext: true,
    textxalign: "center" as const,
    paddingwidth: 8,
    paddingheight: 4,
    alttext: details.join(" | "),
  }
  const barcodeSvg = bwipjs.toSVG(barcodeOptions)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 1000 500" role="img" aria-label="${xml(details.join(" "))}"><rect width="1000" height="500" fill="white"/><text x="500" y="48" text-anchor="middle" font-family="Arial,sans-serif" font-size="30" font-weight="700">${xml(details[0])}</text><text x="500" y="86" text-anchor="middle" font-family="Arial,sans-serif" font-size="27">${xml(details[1])} - ${xml(details[2])}</text><svg x="70" y="105" width="860" height="285" preserveAspectRatio="xMidYMid meet">${barcodeSvg}</svg><text x="65" y="460" font-family="Arial,sans-serif" font-size="20">${xml(details[4])}</text><text x="935" y="460" text-anchor="end" font-family="Arial,sans-serif" font-size="20">${xml(details[5])}</text></svg>`
  const png = await bwipjs.toBuffer(barcodeOptions)
  fs.mkdirSync(outputDirectory, { recursive: true })
  fs.writeFileSync(svgPath, svg, "utf8")
  fs.writeFileSync(pngPath, png)
  if (!svg.includes(CHOCOLATE_BARCODE) || !svg.includes("100mm") || !svg.includes("50mm")) throw new Error("SVG verification failed")
  if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("PNG verification failed")
  console.log("[POS_CHOCOLATE_CODE128_LABEL]")
  console.log(JSON.stringify({
    symbology: "CODE_128",
    value: snapshot.barcode,
    svgPath,
    pngPath,
    svgFullSize: true,
    pngHeaderValid: true,
    databaseWrites: 0,
    passed: true,
  }, null, 2))
}
