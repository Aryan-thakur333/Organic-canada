import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

export default async function dumpShipping({ container }) {
  const fulfillmentModuleService = container.resolve(Modules.FULFILLMENT);
  const options = await fulfillmentModuleService.listShippingOptions({}, { relations: ["rules", "service_zone", "service_zone.geo_zones"] });
  console.log(JSON.stringify(options, null, 2));
}
