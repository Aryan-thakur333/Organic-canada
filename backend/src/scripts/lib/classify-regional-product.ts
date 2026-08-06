export type ProductClassification =
  | "PRODUCTION_STOREFRONT"
  | "DIGITAL_PRODUCTION"
  | "TEST_DATA"
  | "DEBUG_DATA"
  | "INVALID_DATA"
  | "MANUAL_REVIEW"

export interface ProductClassificationResult {
  classification: ProductClassification
  mandatoryForStorefront: boolean
  reasons: string[]
}

/**
 * Classifies a product based on title, handle, status, metadata, and options.
 * Ensures consistent classification across all scripts.
 */
export function classifyRegionalProduct(product: {
  id: string
  title: string
  status: string
  metadata?: any
}): ProductClassificationResult {
  const titleLower = (product.title || "").toLowerCase()
  const handleLower = (product.metadata?.handle || "").toLowerCase()
  const isPublished = product.status === "published"
  const isDigital = product.metadata?.is_digital === true || product.metadata?.is_digital === "true"
  const isSubscription = product.metadata?.is_subscription === true || product.metadata?.is_subscription === "true"

  const reasons: string[] = []
  let classification: ProductClassification = "PRODUCTION_STOREFRONT"

  // 1. Identify Empty / Invalid Products
  const isEmptyOrInvalid =
    titleLower.includes("empty file") ||
    titleLower.includes("e book") ||
    titleLower === "anaana" ||
    titleLower === "abcd"

  if (isEmptyOrInvalid) {
    classification = "INVALID_DATA"
    reasons.push("Product has empty file markers or placeholder titles.")
  }

  // 2. Identify Debug Data
  const isDebug =
    titleLower.includes("debug") ||
    titleLower.includes("dummy") ||
    titleLower.includes("kdksks") ||
    titleLower.includes("ssff") ||
    titleLower.includes("hacker dock") ||
    titleLower.includes("medusa doc") ||
    titleLower.includes("abcdefg") ||
    titleLower.includes("prince product") ||
    titleLower.includes("first product") ||
    titleLower.includes("1 st product") ||
    titleLower.includes("2nd book") ||
    titleLower.includes("3rd book") ||
    titleLower.includes("kmdcdlka") ||
    titleLower.includes("open ebbbok")

  if (isDebug && classification === "PRODUCTION_STOREFRONT") {
    classification = "DEBUG_DATA"
    reasons.push("Title indicates temporary developer debug data.")
  }

  // 3. Identify E2E / Test Data (timestamp-based or specific test keywords)
  const isTest =
    titleLower.includes("test") ||
    titleLower.includes("smoke") ||
    titleLower.includes("audit") ||
    titleLower.includes("verification") ||
    /\d{10,}/.test(titleLower) || // matches millisecond or second timestamps
    titleLower.includes("thekua") // Thekua is a manual testing product here

  if (isTest && classification === "PRODUCTION_STOREFRONT") {
    classification = "TEST_DATA"
    reasons.push("Product was generated during automated E2E tests or QA smoke tests.")
  }

  // 4. Identify Digital Production
  if (isDigital && classification === "PRODUCTION_STOREFRONT") {
    const isLegitDigital =
      titleLower.includes("master class") ||
      titleLower.includes("organic book") ||
      titleLower.includes("physics book")

    if (isLegitDigital) {
      classification = "DIGITAL_PRODUCTION"
      reasons.push("Legitimate digital storefront product.")
    } else {
      classification = "TEST_DATA"
      reasons.push("Digital product appears to be test/debug upload.")
    }
  }

  // 5. Draft Exclusions
  if (!isPublished) {
    reasons.push("Product status is draft, not published.")
  }

  // Mandatory status
  const mandatoryForStorefront =
    classification === "PRODUCTION_STOREFRONT" && isPublished

  return {
    classification,
    mandatoryForStorefront,
    reasons,
  }
}
