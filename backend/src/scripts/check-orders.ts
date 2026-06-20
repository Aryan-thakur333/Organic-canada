import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

export default async function listOrders({ container }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const orderModuleService = container.resolve(Modules.ORDER);
  
  const orders = await orderModuleService.listOrders({}, { relations: ["items"] });
  logger.info(`Found ${orders.length} orders in the database.`);
  for (const order of orders) {
    logger.info(`Order: ${order.id} | Total: ${order.total} | Items: ${order.items?.length || 0}`);
  }
}
