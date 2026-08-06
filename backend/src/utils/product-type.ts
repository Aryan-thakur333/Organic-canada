/**
 * Product type helper utilities.
 * 
 * Product types are stored in product.metadata.product_type and validated
 * against the strict backend enum:
 *   - standard
 *   - digital
 *   - subscription
 *   - personalized
 *   - bundle
 */

export type ProductType =
  | "standard"
  | "digital"
  | "subscription"
  | "personalized"
  | "bundle"

export const VALID_PRODUCT_TYPES: readonly ProductType[] = [
  "standard",
  "digital",
  "subscription",
  "personalized",
  "bundle",
]

export function getProductType(product: { metadata?: Record<string, any> | null }): ProductType {
  const raw = product?.metadata?.product_type
  if (typeof raw === "string" && (VALID_PRODUCT_TYPES as readonly string[]).includes(raw)) {
    return raw as ProductType
  }
  return "standard"
}

export function isStandardProduct(product: { metadata?: Record<string, any> | null }): boolean {
  return getProductType(product) === "standard"
}

export function isDigitalProduct(product: { metadata?: Record<string, any> | null }): boolean {
  return getProductType(product) === "digital"
}

export function isSubscriptionProduct(product: { metadata?: Record<string, any> | null }): boolean {
  return getProductType(product) === "subscription"
}

export function isPersonalizedProduct(product: { metadata?: Record<string, any> | null }): boolean {
  return getProductType(product) === "personalized"
}

export function isBundleProduct(product: { metadata?: Record<string, any> | null }): boolean {
  return getProductType(product) === "bundle"
}