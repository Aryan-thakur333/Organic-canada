// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { asArray, getVendorOwnedProducts } from "../../_ownership"

export async function PATCH(req: MedusaRequest, res: MedusaResponse) {
  const vendor = (req as any).vendor
  const { variant_id } = req.params
  const nextQuantity = Number((req.body as any)?.inventory_quantity ?? (req.body as any)?.stocked_quantity)

  if (!Number.isInteger(nextQuantity) || nextQuantity < 0) {
    return res.status(400).json({ message: "inventory_quantity must be a non-negative integer" })
  }

  try {
    const query: any = req.scope.resolve("query")
    const products = await getVendorOwnedProducts(query, vendor.id, [
      "variants.title",
      "variants.sku",
      "variants.inventory_items.inventory_item_id",
      "variants.inventory_items.inventory.location_levels.id",
      "variants.inventory_items.inventory.location_levels.location_id",
      "variants.inventory_items.inventory.location_levels.stocked_quantity",
      "variants.inventory_items.inventory.location_levels.reserved_quantity",
    ])
    let target: any = null

    for (const product of products) {
      for (const variant of asArray(product.variants)) {
        if (variant.id !== variant_id) continue
        const link = asArray(variant.inventory_items)[0]
        const level = asArray(link?.inventory?.location_levels)[0]
        if (link && level) {
          target = { product, variant, link, level }
        }
      }
    }

    if (!target) {
      return res.status(404).json({ message: "Inventory variant not found for this vendor" })
    }

    const inventoryService: any = req.scope.resolve(Modules.INVENTORY)
    const previousStocked = Number(target.level.stocked_quantity || 0)
    const delta = nextQuantity - previousStocked

    if (delta !== 0) {
      await inventoryService.adjustInventory(target.level.id, {
        inventory_item_id: target.link.inventory_item_id,
        location_id: target.level.location_id,
        adjustment: delta,
      })
    }

    const available = nextQuantity - Number(target.level.reserved_quantity || 0)
    return res.json({
      inventory: {
        product_id: target.product.id,
        product_title: target.product.title,
        variant_id: target.variant.id,
        variant_title: target.variant.title,
        sku: target.variant.sku,
        inventory_item_id: target.link.inventory_item_id,
        level_id: target.level.id,
        location_id: target.level.location_id,
        stocked_quantity: nextQuantity,
        reserved_quantity: Number(target.level.reserved_quantity || 0),
        available_quantity: available,
        stock_status: available <= 0 ? "out of stock" : available <= 5 ? "low stock" : "healthy",
      },
    })
  } catch (error: any) {
    console.error("Vendor inventory variant update failed:", error)
    return res.status(500).json({ message: error.message || "Failed to update inventory" })
  }
}
