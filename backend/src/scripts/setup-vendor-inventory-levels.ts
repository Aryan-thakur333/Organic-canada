import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

export default async function setupVendorInventoryLevels({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const inventoryService: any = container.resolve(Modules.INVENTORY)

  logger.info("==================================================")
  logger.info("PHASE 5 & 6 & 7: SETUP VENDOR INVENTORY LEVEL")
  logger.info("==================================================")

  // Parse arguments from both medusa-supplied args and process.argv
  const rawArgs = [...(Array.isArray(args) ? args : []), ...process.argv.slice(2)]
  
  let stockLocationId = ""
  let stockedQuantity = 100
  let inventoryItemId = ""
  let vendorEmail = ""
  let variantId = ""
  let orderId = ""
  let dryRun = false
  let hasStockedQuantityArg = false

  // Support both key=value and key value
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i]
    if (arg.startsWith("--vendor-email=")) vendorEmail = arg.split("=")[1]
    else if (arg === "--vendor-email" && i + 1 < rawArgs.length) vendorEmail = rawArgs[++i]

    if (arg.startsWith("--stock-location-id=")) stockLocationId = arg.split("=")[1]
    else if (arg === "--stock-location-id" && i + 1 < rawArgs.length) stockLocationId = rawArgs[++i]

    if (arg.startsWith("--stocked-quantity=")) {
      stockedQuantity = parseInt(arg.split("=")[1], 10)
      hasStockedQuantityArg = true
    } else if (arg === "--stocked-quantity" && i + 1 < rawArgs.length) {
      stockedQuantity = parseInt(rawArgs[++i], 10)
      hasStockedQuantityArg = true
    }

    if (arg.startsWith("--variant-id=")) variantId = arg.split("=")[1]
    else if (arg === "--variant-id" && i + 1 < rawArgs.length) variantId = rawArgs[++i]

    if (arg.startsWith("--inventory-item-id=")) inventoryItemId = arg.split("=")[1]
    else if (arg === "--inventory-item-id" && i + 1 < rawArgs.length) inventoryItemId = rawArgs[++i]

    if (arg.startsWith("--order-id=")) orderId = arg.split("=")[1]
    else if (arg === "--order-id" && i + 1 < rawArgs.length) orderId = rawArgs[++i]

    if (arg === "--dry-run") dryRun = true
  }

  // Phase 5: Print parsed process arguments
  console.log("[VENDOR_INVENTORY_CLI_ARGS]", {
    argv: process.argv,
    inventoryItemId,
    stockLocationId,
    stockedQuantity,
  })

  if (!inventoryItemId || !stockLocationId) {
    logger.error("Must provide at least --inventory-item-id and --stock-location-id")
    process.exit(1)
  }

  // Retrieve matching Inventory Item. Throw VENDOR_INVENTORY_ITEM_NOT_FOUND if missing.
  try {
    await inventoryService.retrieveInventoryItem(inventoryItemId)
  } catch (e: any) {
    throw new Error(`VENDOR_INVENTORY_ITEM_NOT_FOUND: ${inventoryItemId}`)
  }

  let createdCount = 0
  let reusedCount = 0
  let isUpdated = false

  // Query exact pair before creation to avoid duplicate unique violations
  const existing = await inventoryService.listInventoryLevels({
    inventory_item_id: inventoryItemId,
    location_id: stockLocationId
  })

  if (existing.length > 0) {
    const level = existing[0]
    logger.info(`[VENDOR_INVENTORY_LEVEL_REUSED] Inventory level already exists for ${inventoryItemId} at ${stockLocationId}.`)
    reusedCount++
    
    if (hasStockedQuantityArg) {
      if (!dryRun) {
        await inventoryService.updateInventoryLevels([{
          id: level.id,
          stocked_quantity: stockedQuantity
        }])
        isUpdated = true
        logger.info(`[VENDOR_INVENTORY_LEVEL_UPDATED] Updated stocked_quantity to ${stockedQuantity}`)
      }
    }
  } else {
    logger.info(`[VENDOR_INVENTORY_SETUP_CREATE] Creating level for ${inventoryItemId} at ${stockLocationId}...`)
    if (!dryRun) {
      await inventoryService.createInventoryLevels([{
        inventory_item_id: inventoryItemId,
        location_id: stockLocationId,
        stocked_quantity: stockedQuantity
      }])
    }
    createdCount++
  }

  if (createdCount === 0 && reusedCount === 0) {
    throw new Error("VENDOR_INVENTORY_LEVEL_NOT_CREATED")
  }

  // Phase 7: Verify immediately after creation
  const verify = await inventoryService.listInventoryLevels({
    inventory_item_id: inventoryItemId,
    location_id: stockLocationId
  })

  if (verify.length === 0) {
    console.error("Verification failed: resultCount is zero.")
    process.exit(1)
  }

  const verifiedLevel = verify[0]
  console.log("\n[VENDOR_EXACT_INVENTORY_LEVEL_AFTER]")
  console.log(JSON.stringify({
    resultCount: verify.length,
    inventoryLevelId: verifiedLevel.id,
    inventoryItemId: verifiedLevel.inventory_item_id,
    locationId: verifiedLevel.location_id,
    stockedQuantity: verifiedLevel.stocked_quantity,
    reservedQuantity: verifiedLevel.reserved_quantity,
    availableQuantity: verifiedLevel.stocked_quantity - verifiedLevel.reserved_quantity
  }, null, 2))

  logger.info("[VENDOR_INVENTORY_SETUP_COMPLETE]")
}
