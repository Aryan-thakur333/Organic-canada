import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows";

export default async function fixStripe({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const paymentService: any = container.resolve(Modules.PAYMENT);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const providers = await paymentService.listPaymentProviders();
  const stripeProvider = providers.find((provider: any) => provider.id === "pp_stripe_stripe");
  if (!stripeProvider) {
    throw new Error("pp_stripe_stripe is not registered. Configure STRIPE_API_KEY and restart Medusa first.");
  }

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "countries.iso_2", "payment_providers.id"],
  });
  const canadaRegions = regions.filter((region: any) =>
    region.countries?.some((country: any) => country.iso_2?.toLowerCase() === "ca")
  );
  logger.info(`Found ${canadaRegions.length} Canada region(s).`);

  for (const region of canadaRegions) {
    const currentProviders = region.payment_providers?.map((provider: any) => provider.id) || [];
    if (currentProviders.includes(stripeProvider.id)) {
      logger.info(`Stripe already linked to ${region.name} (${region.id})`);
      continue;
    }
    logger.info(`Adding stripe to region: ${region.name} (${region.id})`);
    try {
      await updateRegionsWorkflow(container).run({
        input: {
          selector: { id: region.id },
          update: {
            // @ts-ignore Remote provider IDs are accepted by the region workflow.
            payment_providers: [...currentProviders, stripeProvider.id]
          }
        }
      });
      logger.info(`Successfully updated region ${region.name}`);
    } catch (e) {
      logger.error(`Failed to update region ${region.name}: ${e.message}`);
    }
  }
}
