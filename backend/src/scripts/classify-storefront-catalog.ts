import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import { parse } from "csv-parse/sync"
import { csvEscape } from "./lib/merchant-regional-prices"

const GROCERY = /fresh bananas|red strawberries|green grapes|sweet mangoes|organic carrots|fresh broccoli|green spinach|red tomatoes|organic potatoes|organic milk|greek yogurt|cheddar cheese|fresh butter|paneer block|whole wheat bread|croissant|sourdough loaf|muffins pack|organic cookies|chicken breast|lamb chops|turkey slices|beef steak|chicken sausages|salmon fillet|fresh prawns|tuna steak|crab meat|white fish fillet|papaya|pineapple|thekua|organic apples|organic oil|chocolate/i
const APPAREL = /^medusa (sweatpants|shorts|sweatshirt|t-shirt)$/i
const TEST = /audit test|\be2e\b|currency test|price final test|final test|empty file|cad-only|usd-only|debug|codex verification|codex digital upload verification|test product|browser test|price test|sample test|smoke test|\babcd\b|abcdefg|anaana|kdksks|kmdcdlka|hacker dock|medusa doc|first product|1 st product|2nd book|3rd book|physics book|open ebbbok/i
const CLASS_HEADERS = ["product_id","product_handle","product_title","variant_id","variant_title","classification","current_cad_price","current_usd_price","cad_status","usd_status","cad_suspicion","usd_suspicion","recommended_action","merchant_decision","merchant_note"]
const GROCERY_HEADERS = ["priority","product_id","product_handle","product_title","variant_id","variant_title","current_cad_price","approved_cad_price","current_usd_price","approved_usd_price","cad_issue","usd_issue","approval_status","merchant_note"]
const CLEANUP_HEADERS = ["product_id","product_handle","product_title","variant_id","variant_title","current_cad_price","current_usd_price","publication_status","sales_channel_status","recommended_action","merchant_decision","merchant_note"]

export function classifyCatalogRow(row: any) {
  const text = `${row.product_title || ""} ${row.product_handle || ""}`
  if (TEST.test(text)) return "test_or_debug_product"
  if (APPAREL.test(String(row.product_title || ""))) return "real_apparel_product"
  if (GROCERY.test(text)) return "real_grocery_product"
  if (/digital download|ebook|e-book|master class|book/i.test(`${text} ${row.variant_title || ""}`)) return "real_digital_product"
  return "uncertain"
}

function recommended(row: any, classification: string) {
  if (classification === "test_or_debug_product") return "remove_from_storefront_sales_channel"
  if (classification === "uncertain") return "manual_review"
  if (row.cad_status === "missing" && row.usd_status === "missing") return "review_both_prices"
  if (row.cad_status === "missing") return "add_missing_cad"
  if (row.usd_status === "missing") return "add_missing_usd"
  if (row.cad_suspicion !== "none" || row.usd_suspicion !== "none") return "review_price"
  return "keep_live"
}
function write(file: string, headers: string[], rows: Record<string,string>[]) { fs.writeFileSync(file, [headers.join(","), ...rows.map((row) => headers.map((key) => csvEscape(row[key] || "")).join(","))].join("\n") + "\n", "utf8") }

export default async function classifyStorefrontCatalog({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const reports = path.resolve(process.cwd(), "reports"), auditPath = path.join(reports, "storefront-regional-price-audit.csv")
  const auditRows = parse(fs.readFileSync(auditPath, "utf8").replace(/^\uFEFF/, ""), { columns: true, trim: true, skip_empty_lines: true }) as any[]
  const classified = auditRows.map((row) => ({ ...row, classification: classifyCatalogRow(row) }))
  const output = classified.map((row) => ({ product_id: row.product_id, product_handle: row.product_handle, product_title: row.product_title, variant_id: row.variant_id, variant_title: row.variant_title, classification: row.classification, current_cad_price: row.cad_price, current_usd_price: row.usd_price, cad_status: row.cad_status, usd_status: row.usd_status, cad_suspicion: row.cad_suspicion, usd_suspicion: row.usd_suspicion, recommended_action: recommended(row,row.classification), merchant_decision: "pending", merchant_note: "" }))
  write(path.join(reports,"storefront-catalog-classification.csv"), CLASS_HEADERS, output)
  const grocery = classified.filter((row) => row.classification === "real_grocery_product").map((row) => ({ priority: (row.usd_status === "missing" || row.cad_status === "missing" || row.cad_suspicion !== "none") ? "1" : "2", product_id:row.product_id,product_handle:row.product_handle,product_title:row.product_title,variant_id:row.variant_id,variant_title:row.variant_title,current_cad_price:row.cad_price,approved_cad_price:row.merchant_approved_cad_price || "",current_usd_price:row.usd_price,approved_usd_price:row.merchant_approved_usd_price || "",cad_issue:row.cad_suspicion,usd_issue:row.usd_suspicion,approval_status:row.approval_status === "approved" ? "approved" : "pending",merchant_note:row.merchant_note || "" }))
  write(path.join(reports,"real-grocery-price-remediation.csv"), GROCERY_HEADERS, grocery)
  const cleanup = classified.filter((row) => row.classification === "test_or_debug_product").map((row) => ({ product_id:row.product_id,product_handle:row.product_handle,product_title:row.product_title,variant_id:row.variant_id,variant_title:row.variant_title,current_cad_price:row.cad_price,current_usd_price:row.usd_price,publication_status:"published",sales_channel_status:"production",recommended_action:"remove_from_storefront_sales_channel",merchant_decision:"pending",merchant_note:"" }))
  write(path.join(reports,"test-products-storefront-cleanup.csv"), CLEANUP_HEADERS, cleanup)
  const counts = Object.fromEntries(["real_grocery_product","real_apparel_product","real_digital_product","test_or_debug_product","uncertain"].map((kind) => [kind, classified.filter((row) => row.classification === kind).length]))
  logger.info("[STOREFRONT_CATALOG_CLASSIFICATION]"); logger.info(JSON.stringify({ totalRows: classified.length, ...counts, groceryRemediationRows:grocery.length, cleanupRows:cleanup.length, databaseWrites:0 }, null, 2))
}
