import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createInventoryItemsWorkflow,
  createInventoryLevelsWorkflow,
} from "@medusajs/medusa/core-flows"

const DEFAULT_STOCK = 100

export default async function setupVendorInventory({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
  const stockLocationService: any = container.resolve(Modules.STOCK_LOCATION)
  const inventoryService: any = container.resolve(Modules.INVENTORY)

  // Get the default stock location
  const locations = await stockLocationService.listStockLocations({}, { order: { created_at: "ASC" } })
  const location = locations[0]
  if (!location) throw new Error("No stock location exists")
  logger.info(`Using stock location: ${location.name} (${location.id})`)

  // Fetch all products with their variants and existing inventory links
  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "variants.id",
      "variants.title",
      "variants.sku",
      "variants.manage_inventory",
      "variants.inventory_items.inventory_item_id",
      "variants.inventory_items.inventory.location_levels.id",
    ],
  })

  let created = 0
  let linked = 0
  let leveled = 0
  let skipped = 0

  for (const product of products as any[]) {
    for (const variant of product.variants || []) {
      if (variant.manage_inventory === false) {
        skipped++
        continue
      }

      const existingLinks = variant.inventory_items || []
      const existingItemId = existingLinks[0]?.inventory_item_id

      let inventoryItemId = existingItemId

      // Create inventory item if missing
      if (!inventoryItemId) {
        const sku = variant.sku || `AUTO-${variant.id}`
        const { result } = await createInventoryItemsWorkflow(container).run({
          input: {
            items: [{
              sku,
              title: `${product.title} - ${variant.title || "Default"}`,
            }],
          },
        })
        inventoryItemId = result[0].id
        created++

        // Link variant to inventory item
        await remoteLink.create({
          [Modules.PRODUCT]: { variant_id: variant.id },
          [Modules.INVENTORY]: { inventory_item_id: inventoryItemId },
        })
        linked++
      }

      // Check if inventory level exists for this item at the default location
      const levels = await inventoryService.listInventoryLevels({
        inventory_item_id: inventoryItemId,
        location_id: location.id,
      })

      if (!levels.length) {
        await createInventoryLevelsWorkflow(container).run({
          input: {
            inventory_levels: [{
              inventory_item_id: inventoryItemId,
              location_id: location.id,
              stocked_quantity: DEFAULT_STOCK,
            }],
          },
        })
        leveled++
        logger.info(`Created level for variant ${variant.id} (${variant.sku || "no sku"}) @ ${location.id}`)
      }
    }
  }

  logger.info(`Summary: created=${created}, linked=${linked}, levels=${leveled}, skipped=${skipped}`)
}
