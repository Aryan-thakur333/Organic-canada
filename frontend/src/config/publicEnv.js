/**
 * Browser-safe configuration (no secrets).

 * Get Medusa backend URL
 * @returns {string}
 */
export function getMedusaBackendUrl() {
  const explicit = String(
    import.meta.env.VITE_MEDUSA_BACKEND_URL ?? ""
  ).trim()

  if (explicit) {
    return explicit.replace(/\/$/, "")
  }

  const legacy = String(
    import.meta.env.VITE_API_BASE_URL ?? ""
  ).trim()

  if (legacy) {
    return legacy.replace(/\/$/, "")
  }

  return "http://localhost:9000"
}

/**
 * Get Medusa publishable key
 * @returns {string}
 */
export function getMedusaPublishableKey() {
  const key =
    String(
      import.meta.env.VITE_MEDUSA_PUBLISHABLE_KEY ?? ""
    ).trim() ||
    String(
      import.meta.env.VITE_PUBLISHABLE_KEY ?? ""
    ).trim()

  return key
}

/**
 * Check whether Medusa is configured
 * @returns {boolean}
 */
export function isMedusaConfigured() {
  return Boolean(getMedusaPublishableKey())
}

/**
 * Optional default region ID
 * @returns {string | undefined}
 */
export function getDefaultRegionIdFromEnv() {
  const v = String(
    import.meta.env.VITE_MEDUSA_REGION_ID ?? ""
  ).trim()

  return v || undefined
}

/**
 * Optional default storefront sales channel ID.
 * @returns {string | undefined}
 */
export function getDefaultSalesChannelIdFromEnv() {
  const v = String(
    import.meta.env.VITE_MEDUSA_SALES_CHANNEL_ID ?? ""
  ).trim()

  return v || undefined
}
