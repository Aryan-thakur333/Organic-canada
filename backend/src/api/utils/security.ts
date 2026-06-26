import type { MedusaResponse } from "@medusajs/framework/http"

/**
 * Apply HSTS header in production to enforce HTTPS.
 */
export function setHstsHeader(res: MedusaResponse, nodeEnv?: string): void {
  if (nodeEnv === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    )
  }
}
