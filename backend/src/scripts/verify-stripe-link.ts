import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

export default async function verifyStripeLink({ container }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const regionModuleService = container.resolve(Modules.REGION);
  
  const regions = await regionModuleService.listRegions({}, { relations: ["payment_providers"] });
  logger.info(`Found ${regions.length} regions.`);

  for (const region of regions) {
    logger.info(`Region ${region.name} (${region.id}) providers:`);
    const providers = region.payment_providers?.map(p => p.id) || [];
    logger.info(`  ${providers.join(", ")}`);
  }
}
