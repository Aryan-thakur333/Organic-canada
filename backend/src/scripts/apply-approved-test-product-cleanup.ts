import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import { parse } from "csv-parse/sync"

const ALLOWED = new Set(["pending","unpublish","remove_from_storefront","keep_internal","ignore"])
export default async function approvedTestProductCleanup({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER); const apply = process.argv.includes("apply") && !process.argv.includes("dry-run")
  const rows = parse(fs.readFileSync(path.resolve(process.cwd(),"reports","test-products-storefront-cleanup.csv"),"utf8").replace(/^\uFEFF/,""),{columns:true,trim:true,skip_empty_lines:true}) as any[]
  const invalid = rows.filter((row)=>!ALLOWED.has(String(row.merchant_decision||"").toLowerCase())); const planned=rows.filter((row)=>String(row.merchant_decision||"").toLowerCase()!=="pending").map((row)=>({productId:row.product_id,title:row.product_title,decision:row.merchant_decision,action:String(row.merchant_decision).toUpperCase()}))
  logger.info("[TEST_PRODUCT_CLEANUP_DRY_RUN]"); logger.info(JSON.stringify({mode:apply?"APPLY_BLOCKED":"DRY_RUN",totalRows:rows.length,plannedActions:planned,invalidDecisions:invalid.length,catalogWrites:0},null,2))
  if(apply) throw new Error("Apply is intentionally blocked in this review-only workflow. No products were unpublished or removed.")
}
