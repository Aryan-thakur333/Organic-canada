// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

/**
 * GET /vendor/product-tags
 *
 * Returns all product tags for the vendor product form.
 * Vendors can browse and assign tags to their products.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const query = req.scope.resolve("query")

    const { data: tags } = await query.graph({
      entity: "product_tag",
      fields: [
        "id",
        "value",
        "created_at",
      ],
      pagination: { take: 200 },
    })

    return res.json({ tags: tags || [] })
  } catch (error: any) {
    console.error("[Vendor Product Tags] Error:", error)
    return res.status(500).json({ message: error.message || "Failed to load tags" })
  }
}
