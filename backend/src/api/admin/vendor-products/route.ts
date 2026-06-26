// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../modules/vendor"

/**
 * GET /admin/vendor-products (all vendor products)
 * GET /admin/vendor-products?count=true (count only)
 *
 * Returns all products linked to any vendor, grouped by vendor.
 * Admins can view all vendor products here.
 *
 * Performance note: Uses a single query.graph call instead of
 * looping per vendor (N+1 query problem).
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const vendorService: any = req.scope.resolve(VENDOR_MODULE)
    const query: any = req.scope.resolve("query")

    // ── 1. Get all vendor metadata (name, email, status) ────────────────
    const vendors = await vendorService.listVendors({}, {
      select: ["id", "name", "store_name", "email", "status"],
    })

    // Build a fast lookup map: vendorId → { store_name, name, email, status }
    const vendorMap = new Map(vendors.map((v: any) => [v.id, v]))

    // ── 2. Fetch ALL vendors with their linked products in ONE query ────
    const { data: allVendors } = await query.graph({
      entity: "vendor",
      fields: [
        "id",
        "product.id",
        "product.title",
        "product.handle",
        "product.description",
        "product.thumbnail",
        "product.status",
        "product.created_at",
        "product.variants.id",
        "product.variants.title",
        "product.variants.prices.amount",
        "product.variants.prices.currency_code",
      ],
    })

    // ── 3. Flatten into vendorProducts array ────────────────────────────
    const vendorProducts = []

    for (const vendor of (allVendors || [])) {
      const vendorInfo = vendorMap.get(vendor.id)
      const vendorName = vendorInfo?.store_name || vendorInfo?.name || "Unknown"
      const products = vendor.product || []

      // query.graph may return a single object or array for product
      const safeList = Array.isArray(products) ? products : [products]

      for (const product of safeList) {
        if (product?.id) {
          vendorProducts.push({
            ...product,
            vendor_id: vendor.id,
            vendor_name: vendorName,
          })
        }
      }
    }

    // Check if count-only was requested via ?count=true query param
    // (Note: we avoid /count as a path suffix because Medusa routes it
    //  to the [id] wildcard handler.)
    const countOnly = req.query?.count === "true"
    if (countOnly) {
      return res.json({ count: vendorProducts.length, products: vendorProducts })
    }

    return res.json({
      vendor_products: vendorProducts,
      count: vendorProducts.length,
    })
  } catch (error: any) {
    console.error("[Admin Vendor Products] Error:", error)
    return res.status(500).json({ message: error.message || "Failed to fetch vendor products" })
  }
}
