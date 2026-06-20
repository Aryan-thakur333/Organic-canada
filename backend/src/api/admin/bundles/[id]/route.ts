import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { BUNDLE_MODULE } from "../../../../modules/bundle"

// GET /admin/bundles/:id — retrieve a single bundle item
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params

  try {
    const bundleService: any = req.scope.resolve(BUNDLE_MODULE)
    const bundle_item = await bundleService.retrieveBundleItem(id)

    if (!bundle_item) {
      return res.status(404).json({ message: "Bundle item not found" })
    }

    return res.json({ bundle_item })
  } catch (error: any) {
    console.error("[Admin Bundles] Retrieve error:", error)
    return res.status(500).json({ message: error.message || "Failed to retrieve bundle item" })
  }
}

// PUT /admin/bundles/:id — update a bundle item
export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params

  try {
    const bundleService: any = req.scope.resolve(BUNDLE_MODULE)

    // Verify existence
    const existing = await bundleService.retrieveBundleItem(id)
    if (!existing) {
      return res.status(404).json({ message: "Bundle item not found" })
    }

    const { parent_product_id, child_product_id, quantity, sort_order, metadata } = req.body as any

    const updates: Record<string, any> = { id }

    if (parent_product_id !== undefined) updates.parent_product_id = parent_product_id
    if (child_product_id !== undefined) updates.child_product_id = child_product_id
    if (quantity !== undefined) {
      if (typeof quantity !== "number" || quantity < 1 || !Number.isInteger(quantity)) {
        return res.status(400).json({ message: "quantity must be a positive integer" })
      }
      updates.quantity = quantity
    }
    if (sort_order !== undefined) updates.sort_order = sort_order
    if (metadata !== undefined) updates.metadata = metadata

    // If parent or child changed, check for duplicate mapping
    const newParent = updates.parent_product_id ?? existing.parent_product_id
    const newChild = updates.child_product_id ?? existing.child_product_id

    if (updates.parent_product_id || updates.child_product_id) {
      const dupes = await bundleService.listBundleItems({
        parent_product_id: newParent,
        child_product_id: newChild,
      })

      if (dupes.length > 0 && dupes[0].id !== id) {
        return res.status(409).json({
          message: `A bundle mapping already exists for parent ${newParent} → child ${newChild}`,
        })
      }
    }

    // Enforce max 5 children per parent if parent changed
    if (updates.parent_product_id && updates.parent_product_id !== existing.parent_product_id) {
      const children = await bundleService.listBundleItems({
        parent_product_id: newParent,
      })

      if (children.length >= 5) {
        return res.status(400).json({
          message: `Parent product ${newParent} already has ${children.length} child items. Maximum is 5.`,
        })
      }
    }

    const bundle_item = await bundleService.updateBundleItems(updates)

    return res.json({ bundle_item })
  } catch (error: any) {
    console.error("[Admin Bundles] Update error:", error)
    return res.status(500).json({ message: error.message || "Failed to update bundle item" })
  }
}

// DELETE /admin/bundles/:id — soft delete a bundle item
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params

  try {
    const bundleService: any = req.scope.resolve(BUNDLE_MODULE)

    // Verify existence
    const existing = await bundleService.retrieveBundleItem(id)
    if (!existing) {
      return res.status(404).json({ message: "Bundle item not found" })
    }

    await bundleService.softDeleteBundleItems([id])

    return res.status(200).json({
      id,
      deleted: true,
      message: "Bundle item deleted successfully",
    })
  } catch (error: any) {
    console.error("[Admin Bundles] Delete error:", error)
    return res.status(500).json({ message: error.message || "Failed to delete bundle item" })
  }
}
