import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows";

export default async function fixStripe({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const regionModuleService = container.resolve(Modules.REGION);
  
  const regions = await regionModuleService.listRegions();
  logger.info(`Found ${regions.length} regions.`);

  for (const region of regions) {
    logger.info(`Adding stripe to region: ${region.name} (${region.id})`);
    try {
      await updateRegionsWorkflow(container).run({
        input: {
          selector: { id: region.id },
          update: {
            // @ts-ignore
            payment_providers: ["pp_system_default", "pp_stripe_stripe"]
          }
        }
      });
      logger.info(`Successfully updated region ${region.name}`);
    } catch (e) {
      logger.error(`Failed to update region ${region.name}: ${e.message}`);
    }
  }
}
