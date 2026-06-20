import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createShippingOptionsWorkflow } from "@medusajs/medusa/core-flows";

export default async function createGlobalShipping({ container }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
  const regionModuleService = container.resolve(Modules.REGION);

  // Get shipping profile
  const profiles = await fulfillmentModuleService.listShippingProfiles();
  if (profiles.length === 0) {
    logger.error("No shipping profiles found.");
    return;
  }
  const profileId = profiles[0].id;

  // Get service zone
  const zones = await fulfillmentModuleService.listServiceZones();
  if (zones.length === 0) {
    logger.error("No service zones found.");
    return;
  }
  const zoneId = zones[0].id;

  // Get regions
  const regions = await regionModuleService.listRegions();
  
  logger.info("Creating Global Free Shipping option...");

  try {
    const { result } = await createShippingOptionsWorkflow(container).run({
      input: [
        {
          name: "Global Free Shipping",
          price_type: "flat",
          provider_id: "manual_manual",
          service_zone_id: zoneId,
          shipping_profile_id: profileId,
          type: {
            label: "Free",
            description: "Free global shipping.",
            code: "free-shipping",
          },
          prices: [
            { currency_code: "usd", amount: 0 },
            { currency_code: "eur", amount: 0 },
            { currency_code: "cad", amount: 0 },
            ...regions.map(r => ({ region_id: r.id, amount: 0 }))
          ],
          rules: [
            {
              attribute: "enabled_in_store",
              value: "true",
              operator: "eq",
            },
            {
              attribute: "is_return",
              value: "false",
              operator: "eq",
            },
          ],
        }
      ]
    });
    logger.info(`Successfully created Shipping Option: ${result[0].id}`);
  } catch (err) {
    logger.error(`Failed to create shipping option: ${err.message}`);
    console.error(err);
  }
}
