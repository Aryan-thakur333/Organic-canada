import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { addToCartWorkflow } from "@medusajs/medusa/core-flows";

export default async function debugCartAdd({ container }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const cartId = "cart_01KTP3S6N65XBDCZC2JC6J13KS";
  const variantId = "variant_01KT9DT7X1HA1DEYJW2YEXZPW0"; // The one from the previous error

  logger.info(`Attempting to add variant ${variantId} to cart ${cartId}...`);

  try {
    await addToCartWorkflow(container).run({
      input: {
        cart_id: cartId,
        items: [
          {
            variant_id: variantId,
            quantity: 1,
          }
        ]
      }
    });
    logger.info("Successfully added to cart.");
  } catch (err) {
    logger.error("Error adding to cart: " + err.message);
    if (err.stack) {
      logger.error(err.stack);
    }
  }
}
