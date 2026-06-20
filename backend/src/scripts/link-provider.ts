
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

export default async function linkProviderToRegion({ container }) {
  const remoteLink = container.resolve(ContainerRegistrationKeys.LINK);
  const regionModuleService = container.resolve(Modules.REGION);
  
  const regions = await regionModuleService.listRegions({}, { take: 1 });
  const REGION_ID = regions[0]?.id;
  
  if (!REGION_ID) {
    console.error("No regions found to link provider.");
    return;
  }

  const PROVIDER_ID = 'pp_system_default';

  console.log(`Linking ${PROVIDER_ID} to region ${REGION_ID}...`);

  await remoteLink.create({
    [Modules.REGION]: {
      region_id: REGION_ID,
    },
    [Modules.PAYMENT]: {
      payment_provider_id: PROVIDER_ID,
    },
  });

  console.log('Successfully linked provider to region.');
}
