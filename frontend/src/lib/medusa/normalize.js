import { pickProductImageRaw, resolveMedusaImageUrl } from "../../utils/medusaImage";
import { minorToMajor } from "./money";

/**
 * Normalize Medusa store product for existing UI components.
 * @param {Record<string, unknown>} product
 * @param {string | null} [regionId]
 * @returns {Record<string, unknown>}
 */
export function normalizeStoreProduct(product, regionId = null) {
  if (!product || typeof product !== "object") return product;

  const variants = Array.isArray(product.variants) ? product.variants : [];

  const nextVariants = variants.map((v) => {
    const cp = v?.calculated_price;

    if (cp && cp.calculated_amount != null) {
      const amount = Number(cp.calculated_amount);

      if (Array.isArray(v.prices) && v.prices.length) {
        return v;
      }

      return {
        ...v,
        prices: [
          {
            amount,
            currency_code: cp.currency_code || "usd",
          },
        ],
      };
    }

    return v;
  });

  const withVariants = {
    ...product,
    variants: nextVariants,
  };

  const raw = pickProductImageRaw(withVariants);
  const thumbnail = resolveMedusaImageUrl(raw);

  return {
    ...withVariants,
    thumbnail,
    _regionId: regionId,
  };
}

/**
 * @param {unknown[]} products
 * @param {string | null} [regionId]
 */
export function normalizeProductList(products, regionId = null) {
  if (!Array.isArray(products)) return [];
  return products.map((p) => normalizeStoreProduct(p, regionId));
}

/**
 * @param {Record<string, unknown> | undefined} line
 * @returns {number}
 */
export function lineItemUnitPriceMajor(line) {
  if (!line) return 0;
  const up = line.unit_price;
  if (up != null) return minorToMajor(up);
  const sub = line.subtotal;
  const qty = Number(line.quantity) || 1;
  if (sub != null) return minorToMajor(sub) / qty;
  return 0;
}

/**
 * Max purchasable quantity respecting inventory when Medusa reports it.
 * @param {Record<string, unknown> | undefined} line
 */
export function lineItemMaxQuantity(line) {
  const variant = line?.variant;
  const manage = variant?.manage_inventory;
  const inv = variant?.inventory_quantity;
  if (manage && inv != null && Number.isFinite(Number(inv))) {
    return Math.max(0, Math.min(99, Number(inv)));
  }
  return 99;
}

/**
 * Map Medusa cart line to persisted Redux line shape.
 * @param {Record<string, unknown>} line
 */
export function mapCartLineToItem(line) {
  const title =
    (typeof line.title === "string" && line.title) ||
    (typeof line.product_title === "string" && line.product_title) ||
    "Item";

  const thumbRaw =
    (typeof line.thumbnail === "string" && line.thumbnail) ||
    pickProductImageRaw(line.product || {});

  return {
    id: String(line.id),
    variantId: line.variant_id ? String(line.variant_id) : "",
    productId: line.product_id ? String(line.product_id) : "",
    title,
    price: lineItemUnitPriceMajor(line),
    image: resolveMedusaImageUrl(thumbRaw),
    quantity: Math.max(1, Number(line.quantity) || 1),
    maxQuantity: lineItemMaxQuantity(line),
  };
}

/**
 * @param {Record<string, unknown>} cart
 */
export function mapMedusaCartToServerTotals(cart) {
  const currency = String(cart.currency_code || "usd").toLowerCase();
  return {
    currency_code: currency,
    subtotal: minorToMajor(cart.item_subtotal ?? cart.subtotal),
    tax: minorToMajor(cart.tax_total),
    discount: minorToMajor(cart.discount_total),
    shipping: minorToMajor(cart.shipping_total),
    total: minorToMajor(cart.total),
  };
}
