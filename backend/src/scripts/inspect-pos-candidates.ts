import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function inspectPosCandidates({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "product", fields: ["id", "title", "status", "metadata", "sales_channels.id", "sales_channels.name", "variants.id", "variants.sku", "variants.barcode", "variants.upc", "variants.ean", "variants.prices.amount", "variants.prices.currency_code", "variants.inventory_items.inventory.location_levels.location_id", "variants.inventory_items.inventory.location_levels.stocked_quantity", "variants.inventory_items.inventory.location_levels.reserved_quantity"], pagination: { take: 1000 } })
  const candidates = data.map((product) => ({ id: product.id, title: product.title, status: product.status, metadata: product.metadata, channels: product.sales_channels, variants: product.variants })).filter((product) => product.status === "published")
  console.log("[POS_CANDIDATES]")
  console.log(JSON.stringify(candidates, null, 2))
}
