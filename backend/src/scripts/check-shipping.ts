import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

export default async function listShipping({ container }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
  
  const options = await fulfillmentModuleService.listShippingOptions({}, { relations: ["rules", "prices", "service_zone", "service_zone.geo_zones"] });
  logger.info(`Found ${options.length} shipping options.`);
  for (const opt of options) {
    logger.info(`Option: ${opt.name} (${opt.id})`);
    logger.info(`  Service Zone: ${opt.service_zone?.name}`);
    logger.info(`  Geo Zones: ${opt.service_zone?.geo_zones?.map(gz => gz.country_code).join(", ")}`);
    logger.info(`  Rules: ${JSON.stringify(opt.rules)}`);
  }
}
