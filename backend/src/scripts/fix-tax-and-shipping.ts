import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createTaxRegionsWorkflow } from "@medusajs/medusa/core-flows";

export default async function fixTaxAndFulfillment({ container }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const taxModuleService = container.resolve(Modules.TAX);
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);

  // 1. Fix Tax Region
  logger.info("Checking Tax Regions...");
  const taxRegions = await taxModuleService.listTaxRegions({
    country_code: "ca"
  });

  if (taxRegions.length === 0) {
    logger.info("Canada (ca) tax region not found. Creating it...");
    try {
      await createTaxRegionsWorkflow(container).run({
        input: [{
          country_code: "ca",
          provider_id: "tp_system",
        }]
      });
      logger.info("Created Tax Region for 'ca'.");
    } catch (e) {
      logger.error("Failed to create tax region: " + e.message);
    }
  } else {
    logger.info("Tax region for 'ca' already exists.");
  }

  // 2. Fix Fulfillment Geo Zones
  logger.info("Checking Fulfillment Service Zones...");
  const serviceZones = await fulfillmentModuleService.listServiceZones({}, { relations: ["geo_zones"] });
  
  if (serviceZones.length > 0) {
    for (const zone of serviceZones) {
      const hasCanada = zone.geo_zones?.some(gz => gz.country_code === "ca");
      if (!hasCanada) {
        logger.info(`Adding 'ca' to Service Zone: ${zone.name} (${zone.id})`);
        try {
          await fulfillmentModuleService.createGeoZones([{
            type: "country",
            country_code: "ca",
            service_zone_id: zone.id
          }]);
          logger.info("Successfully added 'ca' to Geo Zones.");
        } catch (e) {
          logger.error("Failed to add Geo Zone: " + e.message);
        }
      } else {
        logger.info(`Service Zone '${zone.name}' already has 'ca'.`);
      }
    }
  } else {
    logger.warn("No Service Zones found to update.");
  }
}
