import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { linkSalesChannelsToStockLocationWorkflow } from "@medusajs/medusa/core-flows";

/**
 * Fix: Link ALL sales channels to ALL stock locations.
 * Resolves: "Sales channel is not associated with any stock location for variant ..."
 */
export default async function fixStockLink({ container }) {
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL);
  const stockLocationService = container.resolve(Modules.STOCK_LOCATION);
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

  const channels = await salesChannelService.listSalesChannels();
  const locations = await stockLocationService.listStockLocations();

  logger.info(`Found ${channels.length} sales channel(s) and ${locations.length} stock location(s)`);

  if (!channels.length) {
    logger.error("No sales channels found!");
    return;
  }
  if (!locations.length) {
    logger.error("No stock locations found!");
    return;
  }

  for (const location of locations) {
    const channelIds = channels.map((c) => c.id);
    logger.info(`Linking channels [${channelIds.join(", ")}] to stock location "${location.name}" (${location.id})`);

    try {
      await linkSalesChannelsToStockLocationWorkflow(container).run({
        input: {
          id: location.id,
          add: channelIds,
        },
      });
      logger.info(`Successfully linked to ${location.name}`);
    } catch (err: any) {
      // If already linked, the workflow may throw - that's fine
      if (err.message?.includes("already") || err.message?.includes("duplicate")) {
        logger.info(`Already linked (skipping): ${err.message}`);
      } else {
        logger.error(`Failed to link: ${err.message}`);
      }
    }
  }

  logger.info("Done! All sales channels are now linked to stock locations.");
}
