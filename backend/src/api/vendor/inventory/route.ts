// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { VENDOR_MODULE } from "../../../modules/vendor"
import { asArray, getVendorOwnedProducts } from "../_ownership"

const safeNumber = (val: any, fallback = 0): number => {
  const n = Number(val)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Fetch the vendor's complete inventory list from the query graph.
 * Returns enriched items with product/variant details, inventory IDs, and stock levels.
 * Never crashes — returns empty arrays with fallback values.
 */
async function getVendorInventory(req: MedusaRequest) {
  const vendor = (req as any).vendor
  const query: any = req.scope.resolve("query")

  const products = await getVendorOwnedProducts(query, vendor.id, [
    "type.value",
    "variants.title",
    "variants.sku",
    "variants.inventory_items.inventory_item_id",
    "variants.inventory_items.inventory.id",
    "variants.inventory_items.inventory.location_levels.id",
    "variants.inventory_items.inventory.location_levels.location_id",
    "variants.inventory_items.inventory.location_levels.stocked_quantity",
    "variants.inventory_items.inventory.location_levels.reserved_quantity",
  ])

  return asArray(products).flatMap((product: any) => {
    const productMeta = product.metadata || {}
    const isDigital =
      productMeta.is_digital === true ||
      productMeta.is_digital === "true" ||
      product.type?.value === "Digital Product"

    return asArray(product.variants).flatMap((variant: any) => {
      // For digital products, skip inventory or mark as digital
      if (isDigital || variant.manage_inventory === false) {
        return [{
          product_id: product.id || "",
          product_title: product.title || "Unknown Product",
          variant_id: variant.id || "",
          variant_title: variant.title || "Unknown Variant",
          sku: variant.sku || "",
          is_digital: true,
          inventory_item_id: null,
          level_id: null,
          location_id: null,
          stocked_quantity: 0,
          reserved_quantity: 0,
          available_quantity: 0,
          stock_status: "digital",
        }]
      }

      const inventoryItems = asArray(variant.inventory_items)
      if (inventoryItems.length === 0) {
        return [{
          product_id: product.id || "",
          product_title: product.title || "Unknown Product",
          variant_id: variant.id || "",
          variant_title: variant.title || "Unknown Variant",
          sku: variant.sku || "",
          is_digital: false,
          inventory_item_id: null,
          level_id: null,
          location_id: null,
          stocked_quantity: 0,
          reserved_quantity: 0,
          available_quantity: 0,
          stock_status: "out of stock",
        }]
      }

      return inventoryItems.flatMap((link: any) => {
        const levels = asArray(link.inventory?.location_levels)
        if (levels.length === 0) {
          return [{
            product_id: product.id || "",
            product_title: product.title || "Unknown Product",
            variant_id: variant.id || "",
            variant_title: variant.title || "Unknown Variant",
            sku: variant.sku || "",
            is_digital: false,
            inventory_item_id: link.inventory?.id || link.inventory_item_id || null,
            level_id: null,
            location_id: null,
            stocked_quantity: 0,
            reserved_quantity: 0,
            available_quantity: 0,
            stock_status: "out of stock",
          }]
        }

        return levels.map((level: any) => {
          const stocked = safeNumber(level.stocked_quantity)
          const reserved = safeNumber(level.reserved_quantity)
          const available = stocked - reserved

          return {
            product_id: product.id || "",
            product_title: product.title || "Unknown Product",
            variant_id: variant.id || "",
            variant_title: variant.title || "Unknown Variant",
            sku: variant.sku || "",
            is_digital: false,
            inventory_item_id: link.inventory?.id || link.inventory_item_id || null,
            level_id: level.id || null,
            location_id: level.location_id || null,
            stocked_quantity: stocked,
            reserved_quantity: reserved,
            available_quantity: Math.max(0, available),
            stock_status: available <= 0 ? "out of stock" : available <= 5 ? "low stock" : "healthy",
          }
        })
      })
    })
  })
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const inventory = await getVendorInventory(req)
    const inventoryArr = asArray(inventory)
    const lowStock = inventoryArr.filter((item: any) => item.available_quantity > 0 && item.available_quantity <= 5)
    const outOfStock = inventoryArr.filter((item: any) => item.available_quantity <= 0)

    return res.json({
      inventory: inventoryArr,
      count: inventoryArr.length,
      low_stock_count: lowStock.length,
      out_of_stock_count: outOfStock.length,
      healthy_count: inventoryArr.length - lowStock.length - outOfStock.length,
      alerts: {
        lowStock,
        lowStockCount: lowStock.length,
        outOfStock: outOfStock.length,
      },
    })
  } catch (error: any) {
    console.error("Vendor inventory list failed:", error)
    return res.status(500).json({
      inventory: [],
      count: 0,
      low_stock_count: 0,
      out_of_stock_count: 0,
      healthy_count: 0,
      message: "Failed to load inventory",
    })
  }
}

/**
 * POST /vendor/inventory
 *
 * Update the stocked_quantity for an inventory level owned by the vendor.
 * Creates an audit log entry capturing the previous and new values.
 *
 * Body: { level_id: string, stocked_quantity: number }
 *
 * Returns the updated inventory level.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { level_id, stocked_quantity, notes } = req.body as any
  if (typeof level_id !== "string" || !Number.isInteger(stocked_quantity) || stocked_quantity < 0) {
    return res.status(400).json({ message: "level_id and a non-negative integer stocked_quantity are required" })
  }

  try {
    const vendor = (req as any).vendor
    const inventory = await getVendorInventory(req)
    const inventoryArr = asArray(inventory)
    const targetItem = inventoryArr.find((item: any) => item.level_id === level_id)

    if (!targetItem) {
      return res.status(404).json({ message: "Inventory level not found for this vendor" })
    }

    const previousStocked = safeNumber(targetItem.stocked_quantity)
    const userNote = typeof notes === "string" && notes.trim() ? notes.trim() : null

    // If quantity hasn't changed, still create audit entry if a note was provided
    if (previousStocked === stocked_quantity) {
      if (userNote) {
        const vendorService: any = req.scope.resolve(VENDOR_MODULE)
        try {
          await vendorService.createInventoryAudits({
            vendor_id: vendor.id,
            variant_id: targetItem.variant_id,
            variant_title: targetItem.variant_title,
            product_title: targetItem.product_title,
            sku: targetItem.sku,
            inventory_item_id: targetItem.inventory_item_id,
            level_id: targetItem.level_id,
            previous_stocked_quantity: previousStocked,
            new_stocked_quantity: stocked_quantity,
            previous_reserved_quantity: safeNumber(targetItem.reserved_quantity),
            new_reserved_quantity: safeNumber(targetItem.reserved_quantity),
            change_type: "adjustment",
            source: "vendor_dashboard",
            actor_id: vendor.id,
            actor_type: "vendor",
            notes: userNote,
          })
        } catch (auditErr: any) {
          console.error("[Vendor Inventory] Failed to create audit entry for note:", auditErr.message)
        }
      }
      return res.json({
        inventory_level: { id: level_id, stocked_quantity },
        unchanged: true,
        notes: userNote,
      })
    }

    // Determine change type based on direction
    const changeType = stocked_quantity > previousStocked ? "restock" : "manual_update"

    // Perform the Medusa inventory level adjustment (delta-based)
    const inventoryService: any = req.scope.resolve(Modules.INVENTORY)
    const delta = stocked_quantity - previousStocked
    await inventoryService.adjustInventory(level_id, {
      inventory_item_id: targetItem.inventory_item_id,
      location_id: targetItem.location_id,
      adjustment: delta,
    })

    // Fetch the updated level to get the latest reserved quantity
    let newReserved = safeNumber(targetItem.reserved_quantity)
    try {
      const levels = await inventoryService.listInventoryLevels({ id: level_id })
      if (levels?.[0]?.reserved_quantity !== undefined) {
        newReserved = safeNumber(levels[0].reserved_quantity)
      }
    } catch {
      // best-effort — use the value from getVendorInventory
    }

    // ── Log audit entry ──────────────────────────────────────────────────
    const vendorService: any = req.scope.resolve(VENDOR_MODULE)
    try {
      await vendorService.createInventoryAudits({
        vendor_id: vendor.id,
        variant_id: targetItem.variant_id,
        variant_title: targetItem.variant_title,
        product_title: targetItem.product_title,
        sku: targetItem.sku,
        inventory_item_id: targetItem.inventory_item_id,
        level_id: targetItem.level_id,
        previous_stocked_quantity: previousStocked,
        new_stocked_quantity: stocked_quantity,
        previous_reserved_quantity: safeNumber(targetItem.reserved_quantity),
        new_reserved_quantity: newReserved,
        change_type: changeType,
        source: "vendor_dashboard",
        actor_id: vendor.id,
        actor_type: "vendor",
        notes: userNote,
      })
    } catch (auditErr: any) {
      console.error("[Vendor Inventory] Failed to create audit entry:", auditErr.message)
    }

    return res.json({
      inventory_level: {
        id: level_id,
        stocked_quantity,
        previous_stocked_quantity: previousStocked,
        change_type: changeType,
        notes: userNote,
      },
    })
  } catch (error: any) {
    console.error("Vendor inventory update failed:", error)
    return res.status(500).json({ message: "Failed to update inventory" })
  }
}
