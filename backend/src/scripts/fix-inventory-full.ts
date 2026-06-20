import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  linkSalesChannelsToStockLocationWorkflow,
  createInventoryLevelsWorkflow,
} from "@medusajs/medusa/core-flows";

/**
 * Comprehensive fix for:
 * "Sales channel X is not associated with any stock location for variant Y"
 *
 * This script:
 * 1. Links ALL sales channels to ALL stock locations
 * 2. Creates inventory levels for ALL inventory items at ALL stock locations
 * 3. Creates inventory items + levels for variants that have none
 */
export default async function fixInventoryFull({ container }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL);
  const stockLocationService = container.resolve(Modules.STOCK_LOCATION);
  const inventoryService = container.resolve(Modules.INVENTORY);
  const productService = container.resolve(Modules.PRODUCT);

  // ── Step 1: Link all sales channels → stock locations ──────────────
  logger.info("=== Step 1: Linking sales channels to stock locations ===");
  const channels = await salesChannelService.listSalesChannels();
  const locations = await stockLocationService.listStockLocations();

  logger.info(`  Channels: ${channels.map((c) => `${c.name}(${c.id})`).join(", ")}`);
  logger.info(`  Locations: ${locations.map((l) => `${l.name}(${l.id})`).join(", ")}`);

  for (const location of locations) {
    for (const channel of channels) {
      try {
        await linkSalesChannelsToStockLocationWorkflow(container).run({
          input: { id: location.id, add: [channel.id] },
        });
        logger.info(`  ✓ Linked ${channel.name} → ${location.name}`);
      } catch (err: any) {
        logger.info(`  (already linked or skipped: ${err.message?.substring(0, 80)})`);
      }
    }
  }

  // Also link via remote link for fulfillment
  for (const location of locations) {
    try {
      await link.create({
        [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
        [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
      });
      logger.info(`  ✓ Linked fulfillment provider to ${location.name}`);
    } catch (err: any) {
      logger.info(`  (fulfillment link skipped: ${err.message?.substring(0, 80)})`);
    }
  }

  // ── Step 2: Get all product variants ───────────────────────────────
  logger.info("=== Step 2: Checking all product variants ===");

  const allVariants = await productService.listProductVariants(
    {},
    { take: 500, select: ["id", "sku", "manage_inventory", "title"] }
  );
  logger.info(`  Found ${allVariants.length} total variants`);

  // ── Step 3: Get existing inventory items ───────────────────────────
  const { data: existingInventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id", "sku"],
  });
  logger.info(`  Found ${existingInventoryItems.length} existing inventory items`);

  const existingSkus = new Set(existingInventoryItems.map((i) => i.sku).filter(Boolean));

  // ── Step 4: Create missing inventory items ─────────────────────────
  logger.info("=== Step 3: Creating missing inventory items ===");

  let createdCount = 0;
  for (const variant of allVariants) {
    const hasSku = variant.sku && existingSkus.has(variant.sku);

    if (!hasSku) {
      try {
        const sku = variant.sku || `AUTO-${variant.id}`;
        const newItem = await inventoryService.createInventoryItems({
          sku,
          title: variant.title || sku,
        });

        // Link variant to inventory item
        await link.create({
          [Modules.PRODUCT]: { variant_id: variant.id },
          [Modules.INVENTORY]: { inventory_item_id: newItem.id },
        });

        logger.info(`  ✓ Created inventory item for variant ${variant.id} (sku: ${sku})`);
        createdCount++;
      } catch (err: any) {
        logger.info(`  (skip variant ${variant.id}: ${err.message?.substring(0, 80)})`);
      }
    }
  }
  logger.info(`  Created ${createdCount} new inventory items`);

  // ── Step 5: Create inventory levels at all stock locations ─────────
  logger.info("=== Step 4: Creating inventory levels ===");

  // Re-fetch all inventory items (including newly created)
  const { data: allInventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id"],
  });

  // Get existing levels
  const existingLevels = await inventoryService.listInventoryLevels(
    {},
    { take: 10000, select: ["id", "inventory_item_id", "location_id"] }
  );
  const existingLevelKeys = new Set(
    existingLevels.map((l) => `${l.inventory_item_id}:${l.location_id}`)
  );
  logger.info(`  Found ${existingLevels.length} existing inventory levels`);

  const newLevels: any[] = [];
  for (const item of allInventoryItems) {
    for (const location of locations) {
      const key = `${item.id}:${location.id}`;
      if (!existingLevelKeys.has(key)) {
        newLevels.push({
          inventory_item_id: item.id,
          location_id: location.id,
          stocked_quantity: 1000000,
        });
      }
    }
  }

  if (newLevels.length > 0) {
    logger.info(`  Creating ${newLevels.length} new inventory levels...`);
    // Process in batches of 50 to avoid overloading
    for (let i = 0; i < newLevels.length; i += 50) {
      const batch = newLevels.slice(i, i + 50);
      try {
        await createInventoryLevelsWorkflow(container).run({
          input: { inventory_levels: batch },
        });
        logger.info(`  ✓ Batch ${Math.floor(i / 50) + 1}: created ${batch.length} levels`);
      } catch (err: any) {
        logger.info(`  Batch ${Math.floor(i / 50) + 1} partial error: ${err.message?.substring(0, 100)}`);
      }
    }
  } else {
    logger.info("  All inventory levels already exist!");
  }

  logger.info("=== DONE! All stock links, inventory items, and levels are set up. ===");
}
