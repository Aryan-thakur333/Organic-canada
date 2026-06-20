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

  console.log("MEDUSA KEY:", key)

  return key
}

/**
 * Check whether Medusa is configured
 * @returns {boolean}
 */
export function isMedusaConfigured() {
  const configured = Boolean(getMedusaPublishableKey())

  console.log("MEDUSA CONFIGURED:", configured)

  return configured
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
 * Default country code
 * @returns {string}
 */
export function getDefaultCountryCode() {
  const v = String(
    import.meta.env.VITE_STORE_DEFAULT_COUNTRY_CODE ?? ""
  ).trim().toLowerCase()

  if (v && v !== "undefined" && v !== "null") return v
  
  // Default to 'ca' since the Medusa region is Canada (ca)
  return "ca"
}