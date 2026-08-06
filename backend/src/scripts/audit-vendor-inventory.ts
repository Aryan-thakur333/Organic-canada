import { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

export default function auditVendorInventory({ container }: ExecArgs) {
  return async () => {
    console.log("==================================================")
    console.log("PHASE 3 & 4: AUDIT VENDOR INVENTORY LEVEL & ITEM")
    console.log("==================================================")

    const rawArgs = process.argv.slice(2)
    let inventoryItemId = ""
    let stockLocationId = ""

    for (const arg of rawArgs) {
      if (arg.startsWith("--inventory-item-id=")) inventoryItemId = arg.split("=")[1]
      if (arg.startsWith("--stock-location-id=")) stockLocationId = arg.split("=")[1]
    }

    if (!inventoryItemId || !stockLocationId) {
      console.error("Missing required arguments: --inventory-item-id or --stock-location-id")
      process.exit(1)
    }

    const inventoryModule: any = container.resolve(Modules.INVENTORY)
    const query = container.resolve("query")

    // Phase 3: Verify the inventory item exists
    let inventoryItem: any = null
    let deletedAt = null
    let sku = ""
    let title = ""
    let exists = false
    try {
      inventoryItem = await inventoryModule.retrieveInventoryItem(inventoryItemId)
      exists = !!inventoryItem
      deletedAt = inventoryItem.deleted_at || null
      sku = inventoryItem.sku || ""
      title = inventoryItem.title || ""
    } catch (e: any) {
      console.error(`[VENDOR_INVENTORY_ITEM_NOT_FOUND] Error retrieving item ${inventoryItemId}: ${e.message}`)
    }

    console.log("[VENDOR_INVENTORY_ITEM_RUNTIME_CHECK]")
    console.log(JSON.stringify({
      inventoryItemId,
      exists,
      deletedAt,
      sku,
      title
    }, null, 2))

    // Retrieve Variant ↔ Inventory Item link
    let variantId = "unknown"
    let linkExists = false
    let requiredQuantity = 0

    if (inventoryItem) {
      const { data: variants } = await query.graph({
        entity: "variant",
        fields: ["id", "inventory_items.inventory_item_id", "inventory_items.required_quantity"]
      })

      const variant = variants.find((candidate) =>
        (candidate.inventory_items || []).some((item: any) => item.inventory_item_id === inventoryItemId)
      )
      if (variant) {
        variantId = variant.id
        const link = (variant.inventory_items || []).find((i: any) => i.inventory_item_id === inventoryItemId)
        if (link) {
          linkExists = true
          requiredQuantity = link.required_quantity || 1
        }
      }
    }

    console.log("[VENDOR_VARIANT_INVENTORY_LINK_CHECK]")
    console.log(JSON.stringify({
      variantId,
      inventoryItemId,
      linkExists,
      requiredQuantity
    }, null, 2))

    // Phase 4: Query exact inventory level pair before
    const levels = await inventoryModule.listInventoryLevels({
      inventory_item_id: inventoryItemId,
      location_id: stockLocationId
    })

    console.log("[VENDOR_EXACT_INVENTORY_LEVEL_BEFORE]")
    console.log(JSON.stringify({
      inventoryItemId,
      locationId: stockLocationId,
      resultCount: levels.length,
      levels
    }, null, 2))
  }
}
