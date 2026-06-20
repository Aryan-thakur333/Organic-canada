import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { BUNDLE_MODULE } from "../../../modules/bundle"

// GET /admin/bundles — list bundle items with optional filtering and pagination
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const bundleService: any = req.scope.resolve(BUNDLE_MODULE)

    const { parent_product_id, child_product_id, offset, limit } = req.query as any

    const filters: Record<string, any> = {}
    if (parent_product_id) filters.parent_product_id = parent_product_id
    if (child_product_id) filters.child_product_id = child_product_id

    const listOptions: any = {
      order: { sort_order: "ASC", created_at: "DESC" },
      skip: parseInt(offset as string) || 0,
      take: Math.min(parseInt(limit as string) || 50, 200),
    }

    const [bundle_items, count] = await bundleService.listAndCountBundleItems(
      filters,
      listOptions
    )

    return res.json({
      bundle_items,
      count,
      offset: listOptions.skip,
      limit: listOptions.take,
    })
  } catch (error: any) {
    console.error("[Admin Bundles] List error:", error)
    return res.status(500).json({ message: error.message || "Failed to list bundle items" })
  }
}

// POST /admin/bundles — create a new bundle item (parent→child mapping)
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const bundleService: any = req.scope.resolve(BUNDLE_MODULE)

    const { parent_product_id, child_product_id, quantity, sort_order, metadata } = req.body as any

    // Validate required fields
    if (!parent_product_id || !child_product_id) {
      return res.status(400).json({
        message: "parent_product_id and child_product_id are required",
      })
    }

    // Validate quantity is a positive integer
    if (quantity !== undefined && (typeof quantity !== "number" || quantity < 1 || !Number.isInteger(quantity))) {
      return res.status(400).json({ message: "quantity must be a positive integer" })
    }

    // Check for duplicate mapping
    const existing = await bundleService.listBundleItems({
      parent_product_id,
      child_product_id,
    })

    if (existing.length > 0) {
      return res.status(409).json({
        message: `A bundle mapping already exists for parent ${parent_product_id} → child ${child_product_id}`,
      })
    }

    // Enforce max 5 children per parent
    const existingChildren = await bundleService.listBundleItems({
      parent_product_id,
    })

    if (existingChildren.length >= 5) {
      return res.status(400).json({
        message: `Parent product ${parent_product_id} already has ${existingChildren.length} child items. Maximum is 5.`,
      })
    }

    const bundle_item = await bundleService.createBundleItems({
      parent_product_id,
      child_product_id,
      quantity: quantity != null ? quantity : 1,
      sort_order: sort_order != null ? sort_order : existingChildren.length,
      metadata: metadata || null,
    })

    return res.status(201).json({ bundle_item })
  } catch (error: any) {
    console.error("[Admin Bundles] Create error:", error)
    return res.status(500).json({ message: error.message || "Failed to create bundle item" })
  }
}
