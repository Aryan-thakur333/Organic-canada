import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import { MerchantRegionalPriceRow, priceForCurrency, readMerchantApprovalCsv, writeMerchantApprovalCsv } from "./lib/merchant-regional-prices.js"

function timestamp() { return new Date().toISOString().replace(/[:.]/g, "-") }

export default async function synchronizeMerchantRegionalPriceSnapshots({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER), query = container.resolve(ContainerRegistrationKeys.QUERY)
  const csvPath = path.resolve(process.cwd(), "reports", "merchant-approved-regional-prices.csv"), { rows } = readMerchantApprovalCsv(csvPath)
  const synchronized: MerchantRegionalPriceRow[] = []
  for (const row of rows) {
    const { data } = await query.graph({ entity: "product", fields: ["id", "variants.id", "variants.prices.amount", "variants.prices.currency_code"], filters: { id: row.productId } })
    const variant = data?.[0]?.variants?.find((candidate: any) => candidate.id === row.variantId)
    if (!variant) throw new Error(`Cannot synchronize row ${row.rowNumber}: variant '${row.variantId}' no longer matches product '${row.productId}'`)
    synchronized.push({ ...row, currentCadPrice: String(priceForCurrency(variant, "cad")?.amount ?? ""), currentUsdPrice: String(priceForCurrency(variant, "usd")?.amount ?? "") })
  }
  if (synchronized.length !== rows.length) throw new Error("Snapshot row count changed during synchronization")
  const temporaryPath = `${csvPath}.tmp`; writeMerchantApprovalCsv(temporaryPath, synchronized)
  try {
    const checked = readMerchantApprovalCsv(temporaryPath)
    if (checked.rows.length !== rows.length) throw new Error("Temporary CSV row count validation failed")
  } catch (error) { fs.rmSync(temporaryPath, { force: true }); throw error }
  const backupDir = path.resolve(process.cwd(), "reports", "backups"); fs.mkdirSync(backupDir, { recursive: true })
  const backupPath = path.join(backupDir, `merchant-approved-regional-prices-before-snapshot-sync-${timestamp()}.csv`)
  if (fs.existsSync(backupPath)) { fs.rmSync(temporaryPath, { force: true }); throw new Error(`Backup already exists: ${backupPath}`) }
  fs.renameSync(csvPath, backupPath)
  try { fs.renameSync(temporaryPath, csvPath) } catch (error) { fs.renameSync(backupPath, csvPath); throw error }
  logger.info("[MERCHANT_REGIONAL_PRICE_SNAPSHOTS_SYNCHRONIZED]")
  logger.info(JSON.stringify({ csvPath, backupPath, totalRows: synchronized.length, databaseWrites: 0 }, null, 2))
}
