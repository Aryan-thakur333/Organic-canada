import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import { csvEscape, isTestOrDebugProduct, pricesForCurrency } from "./lib/storefront-regional-price-review.js"

export default async function backupStorefrontRegionalPrices({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER), query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "product", fields: ["id", "title", "handle", "metadata", "status", "variants.id", "variants.prices.currency_code", "variants.prices.amount"] })
  const batchId = `storefront-regional-price-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`
  const rows = (data || []).filter((product: any) => product.status === "published" && !isTestOrDebugProduct(product)).flatMap((product: any) => (product.variants || []).flatMap((variant: any) => ["usd", "cad"].map((currency) => [product.id, variant.id, currency, pricesForCurrency(variant, currency)[0]?.amount ?? "", "", batchId, new Date().toISOString()])))
  const backupDir = path.resolve(process.cwd(), "reports", "backups"); fs.mkdirSync(backupDir, { recursive: true })
  const filePath = path.join(backupDir, `${batchId}.csv`)
  fs.writeFileSync(filePath, [["product_id", "variant_id", "currency_code", "old_amount", "new_amount", "batch_id", "timestamp"].join(","), ...rows.map((row: any[]) => row.map(csvEscape).join(","))].join("\n") + "\n", "utf8")
  logger.info("[STOREFRONT_REGIONAL_PRICE_BACKUP_READY]"); logger.info(JSON.stringify({ batchId, filePath, records: rows.length, writesPerformed: 0 }, null, 2))
}
