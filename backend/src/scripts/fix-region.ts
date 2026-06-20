import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows";

export default async function fixRegion({ container }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const regionService = container.resolve(Modules.REGION);

  const regions = await regionService.listRegions({}, { relations: ["countries"] });
  if (!regions.length) {
    logger.error("No regions found.");
    return;
  }

  const region = regions[0];
  logger.info(`Found region: ${region.name} (${region.id})`);
  
  const currentCountries = region.countries?.map(c => c.iso_2) || [];
  logger.info(`Current countries: ${currentCountries.join(", ")}`);

  if (!currentCountries.includes("ca")) {
    const updatedCountries = [...currentCountries, "ca"];
    logger.info(`Adding 'ca'. New countries list: ${updatedCountries.join(", ")}`);

    try {
      await updateRegionsWorkflow(container).run({
        input: {
          selector: { id: region.id },
          update: {
            countries: updatedCountries,
          }
        }
      });
      logger.info("Successfully updated region to include Canada (ca).");
    } catch (e) {
      logger.error("Failed to update region: " + e.message);
    }
  } else {
    logger.info("Region already includes Canada (ca).");
  }
}
