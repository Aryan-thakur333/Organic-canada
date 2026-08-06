export type CommerceFeature = "subscriptions" | "personalized_products" | "bundled_products"

const ENV_BY_FEATURE: Record<CommerceFeature, string> = {
  subscriptions: "FEATURE_SUBSCRIPTIONS",
  personalized_products: "FEATURE_PERSONALIZED_PRODUCTS",
  bundled_products: "FEATURE_BUNDLED_PRODUCTS",
}

export function isCommerceFeatureEnabled(feature: CommerceFeature): boolean {
  return String(process.env[ENV_BY_FEATURE[feature]] || "").trim().toLowerCase() === "true"
}

export function commerceFeatureDisabledBody(feature: CommerceFeature) {
  return {
    code: "COMMERCE_FEATURE_DISABLED",
    feature,
    message: "This commerce feature is not enabled.",
  }
}

