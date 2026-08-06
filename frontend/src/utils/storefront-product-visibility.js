const TEST_OR_DEBUG = /\btest\b|\be2e\b|debug|codex verification|cad-only|usd-only|empty file|browser test|smoke test/i;

/** Temporary client safeguard until catalog classification metadata is persisted. */
export function getStorefrontProductVisibility(product) {
  const metadata = product?.metadata || {};
  if (metadata.storefront_visibility === "hidden" || metadata.catalog_classification === "test_or_debug_product") return { visible: false, reason: "catalog_metadata" };
  const identity = `${product?.title || ""} ${product?.handle || ""}`;
  return TEST_OR_DEBUG.test(identity) ? { visible: false, reason: "test_or_debug" } : { visible: true, reason: "public" };
}
