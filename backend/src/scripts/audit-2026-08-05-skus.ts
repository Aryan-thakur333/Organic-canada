import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function auditSkus({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY) as any

  // 1. All variants with SKU SHIRT-S-BLACK (exact)
  const { data: exact } = await query.graph({
    entity: "variant",
    fields: [
      "id",
      "sku",
      "title",
      "product.id",
      "product.title",
      "product.status",
      "product.sales_channels.id",
      "inventory_items.inventory_item_id",
      "inventory_items.inventory.location_levels.location_id",
      "inventory_items.inventory.location_levels.stocked_quantity",
    ],
    filters: { sku: ["SHIRT-S-BLACK"] },
  })
  console.log("[AUDIT_EXACT_SKU] count=" + exact.length)
  for (const v of exact as any[]) {
    const channels = (v.product?.sales_channels || []).map((c: any) => c.id)
    console.log(
      JSON.stringify({
        variant_id: v.id,
        product_id: v.product?.id,
        product_title: v.product?.title,
        status: v.product?.status,
        channels,
        in_pos_channel: channels.includes("sc_01KWSKACE7DEGMXG6GH1ZRSA4V"),
        inventory_item_id: v.inventory_items?.[0]?.inventory_item_id,
        levels: (v.inventory_items?.[0]?.inventory?.location_levels || []).map((l: any) => ({
          location_id: l.location_id,
          stocked_quantity: l.stocked_quantity,
        })),
      })
    )
  }

  // 2. Global duplicate SKU scan (top offenders)
  const { data: allVariants } = await query.graph({
    entity: "variant",
    fields: ["id", "sku"],
    pagination: { take: 100000 },
  })
  const counts = new Map<string, number>()
  const ids = new Map<string, string[]>()
  for (const v of allVariants as any[]) {
    const sku = String(v.sku || "").trim()
    if (!sku) continue
    counts.set(sku, (counts.get(sku) || 0) + 1)
    if (!ids.has(sku)) ids.set(sku, [])
    ids.get(sku)!.push(v.id)
  }
  const dupes = Array.from(counts.entries())
    .filter(([, c]) => c > 1)
    .sort((a, b) => b[1] - a[1])
  console.log("[AUDIT_DUPLICATE_SKUS] total=" + dupes.length)
  for (const [sku, c] of dupes.slice(0, 25)) {
    console.log(JSON.stringify({ sku, count: c, variant_ids: ids.get(sku) }))
  }
}
