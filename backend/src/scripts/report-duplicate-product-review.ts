import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import * as fs from "fs"
import * as path from "path"
import { csvEscape, readCatalogCleanupCsv, salesChannelIds } from "./lib/catalog-cleanup.js"

export default async function reportDuplicateProductReview({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const auditRows = readCatalogCleanupCsv().filter((row) => row.duplicate_group)
  const rows: string[][] = [["duplicate_group", "product_id", "title", "handle", "created_at", "updated_at", "status", "sales_channel_membership", "variant_count", "cad_prices", "usd_prices", "media_count", "metadata_summary", "order_line_usage_count", "recommended_master_product", "master_recommendation_reason", "approved_master_product_id", "approved_duplicate_action"]]
  const groups = new Map<string, any[]>()
  for (const row of auditRows) groups.set(row.duplicate_group, [...(groups.get(row.duplicate_group) || []), row])
  for (const [group, members] of groups) {
    const productIds = members.map((member) => member.product_id)
    const { data: products } = await query.graph({ entity: "product", fields: ["id", "title", "handle", "status", "metadata", "created_at", "updated_at", "sales_channels.id", "variants.id", "variants.prices.amount", "variants.prices.currency_code", "images.id"], filters: { id: productIds } })
    const sorted = [...(products || [])].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const master = sorted[0]
    for (const product of sorted) {
      const prices = (product.variants || []).flatMap((variant: any) => variant.prices || [])
      rows.push([group, product.id, product.title, product.handle || "", String(product.created_at || ""), String(product.updated_at || ""), product.status || "", salesChannelIds(product).join("|"), String((product.variants || []).length), prices.filter((price: any) => String(price.currency_code).toLowerCase() === "cad").map((price: any) => price.amount).join("|"), prices.filter((price: any) => String(price.currency_code).toLowerCase() === "usd").map((price: any) => price.amount).join("|"), String((product.images || []).length), JSON.stringify(product.metadata || {}).slice(0, 500), "", master?.id || "", "Oldest current record; this is a reporting suggestion only", "", ""])
    }
  }
  const reportPath = path.resolve(process.cwd(), "reports", "duplicate-product-review.csv")
  fs.writeFileSync(reportPath, rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n", "utf8")
  logger.info("[DUPLICATE_PRODUCT_REVIEW]")
  logger.info(JSON.stringify({ reportPath, duplicateGroups: groups.size, productsReported: rows.length - 1, writesPerformed: 0 }, null, 2))
}
