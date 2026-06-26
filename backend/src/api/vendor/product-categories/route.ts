// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createProductCategoriesWorkflow } from "@medusajs/medusa/core-flows"

const GROCERY_CATEGORIES = [
  ["Fruits", "fruits"],
  ["Vegetables", "vegetables"],
  ["Dairy", "dairy"],
  ["Bakery", "bakery"],
  ["Meat", "meat"],
  ["Seafood", "seafood"],
]

async function ensureGroceryCategories(req: MedusaRequest) {
  const query = req.scope.resolve("query")
  const handles = GROCERY_CATEGORIES.map(([, handle]) => handle)
  const { data: existing } = await query.graph({
    entity: "product_category",
    fields: ["id", "handle"],
    filters: { handle: handles },
  })
  const existingHandles = new Set((existing || []).map((category: any) => category.handle))
  const missing = GROCERY_CATEGORIES
    .filter(([, handle]) => !existingHandles.has(handle))
    .map(([name, handle]) => ({
      name,
      handle,
      is_active: true,
      is_internal: false,
    }))

  if (missing.length) {
    await createProductCategoriesWorkflow(req.scope).run({
      input: { product_categories: missing },
    })
  }
}

/**
 * GET /vendor/product-categories
 *
 * Returns all product categories for the vendor product form.
 * Vendors can browse and assign categories to their products.
 *
 * Query params:
 *   - parent_category_id?: Filter by parent
 *   - include_descendants_tree?: Include full category tree
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const query = req.scope.resolve("query")
    await ensureGroceryCategories(req)

    const filters: any = {}
    if (req.query.parent_category_id) {
      filters.parent_category_id = req.query.parent_category_id
    }

    const { data: categories } = await query.graph({
      entity: "product_category",
      fields: [
        "id",
        "name",
        "handle",
        "description",
        "parent_category_id",
        "rank",
        "is_active",
        "is_internal",
        "created_at",
      ],
      filters: Object.keys(filters).length ? filters : undefined,
      pagination: { take: 200 },
    })

    return res.json({ categories: categories || [] })
  } catch (error: any) {
    console.error("[Vendor Product Categories] Error:", error)
    return res.status(500).json({ message: error.message || "Failed to load categories" })
  }
}
