import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { BUNDLE_MODULE } from "../../../../modules/bundle"

/**
 * GET /store/bundles/:parent_product_id
 *
 * Returns all child products that belong to a parent bundle product.
 * Enriches each child with product details (title, thumbnail, handle)
 * so the storefront can render them directly.
 *
 * Example response:
 * {
 *   "parent_product_id": "prod_xxx",
 *   "items": [
 *     {
 *       "child_product_id": "prod_yyy",
 *       "quantity": 1,
 *       "sort_order": 0,
 *       "product": { "id": "prod_yyy", "title": "Organic Almonds", "thumbnail": "...", "handle": "..." }
 *     }
 *   ]
 * }
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const parent_product_id = req.params.parent_product_id

  if (!parent_product_id) {
    return res.status(400).json({ message: "parent_product_id is required" })
  }

  try {
    const bundleService: any = req.scope.resolve(BUNDLE_MODULE)
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

    // Fetch all child bundle items for this parent product, ordered by sort_order
    const bundle_items = await bundleService.listBundleItems(
      { parent_product_id },
      { order: { sort_order: "ASC" }, take: 5 }
    )

    if (bundle_items.length === 0) {
      return res.json({
        parent_product_id,
        items: [],
        total_items: 0,
      })
    }

    // Collect unique child product IDs for enrichment
    const childProductIds = [...new Set(bundle_items.map((bi: any) => bi.child_product_id))]

    // Enrich with product details via the Medusa query engine
    const childIds: string[] = childProductIds as string[]

    const { data: childProducts } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "handle",
        "thumbnail",
        "subtitle",
        "status",
        "variants.id",
        "variants.title",
        "variants.prices.amount",
        "variants.prices.currency_code",
      ],
      filters: { id: childIds },
    })

    // Build a lookup map for O(1) access
    const productMap = new Map<string, any>()
    for (const product of childProducts || []) {
      productMap.set(product.id, product)
    }

    // Merge bundle item data with product details
    const items = bundle_items.map((bi: any) => ({
      child_product_id: bi.child_product_id,
      quantity: bi.quantity,
      sort_order: bi.sort_order,
      product: productMap.get(bi.child_product_id) || null,
    }))

    return res.json({
      parent_product_id,
      items,
      total_items: items.length,
    })
  } catch (error: any) {
    console.error("[Store Bundles] Failed to fetch bundle items:", error)
    return res.status(500).json({
      message: error.message || "Failed to fetch bundle products",
    })
  }
}
