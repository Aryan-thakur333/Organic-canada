import { getDisplayPrice } from "./pricing";
import { getStorefrontProductVisibility } from "./storefront-product-visibility";

function inventoryAvailable(variant) {
  if (!variant) return false;
  if (variant.allow_backorder) return true;
  if (!variant.manage_inventory) return true;
  if (variant.inventory_quantity === undefined || variant.inventory_quantity === null) return true;
  return Number(variant.inventory_quantity) > 0;
}

/**
 * Gives every storefront surface one strict answer for visibility and purchase
 * eligibility. Product amounts are already Medusa major units.
 */
export function getStorefrontProductState(product, context = {}) {
  const visibility = getStorefrontProductVisibility(product);
  const variant = product?.variants?.find((item) => item?.id === context.variantId)
    || product?.variants?.[0]
    || null;
  const price = getDisplayPrice(product, { ...context, variantId: variant?.id });
  const availableInventory = inventoryAvailable(variant);

  return {
    publicVisible: visibility.visible,
    priceAvailable: price.hasPrice,
    inventoryAvailable: availableInventory,
    purchasable: visibility.visible && price.hasPrice && availableInventory,
    amount: price.amount,
    currencyCode: price.currencyCode,
    source: price.source || "unavailable",
    reason: !visibility.visible
      ? visibility.reason
      : !price.hasPrice
        ? price.reason || "missing_price"
        : !availableInventory
          ? "out_of_stock"
          : undefined,
    price,
    variant,
  };
}

export function isPublicStorefrontProduct(product) {
  return getStorefrontProductVisibility(product).visible;
}

export function isProductPurchasableInRegion(product, context = {}) {
  return getStorefrontProductState(product, context).purchasable;
}
