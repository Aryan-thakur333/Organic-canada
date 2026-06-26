import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// ── In-memory rate limit bucket store ────────────────────────────────────────
// Uses an in-memory Map (lost on restart). For multi-instance deployments,
// replace with Redis-backed rate limiting.
export const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>()

/**
 * Extract the client IP from a request, respecting the X-Forwarded-For header.
 */
export function getClientIp(req: Pick<MedusaRequest, "headers" | "ip">): string {
  const forwardedFor = req.headers["x-forwarded-for"]
  return (
    (Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(",")[0]) ||
    req.ip ||
    "unknown"
  ).trim()
}

/**
 * Check whether a request is within its rate limit for the given key.
 * Mutates the internal `rateLimitBuckets` store.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const current = rateLimitBuckets.get(key)
  const attempt =
    !current || current.resetAt <= now
      ? { count: 1, resetAt: now + windowMs }
      : { count: current.count + 1, resetAt: current.resetAt }

  rateLimitBuckets.set(key, attempt)

  return {
    allowed: attempt.count <= maxRequests,
    remaining: Math.max(0, maxRequests - attempt.count),
    resetAt: attempt.resetAt,
  }
}

/**
 * Set standard RateLimit headers on the response.
 */
export function setRateLimitHeaders(
  res: MedusaResponse,
  limit: number,
  remaining: number,
  resetAt: number
): void {
  const resetSeconds = Math.ceil(resetAt / 1000)
  res.setHeader("RateLimit-Limit", String(limit))
  res.setHeader("RateLimit-Remaining", String(remaining))
  res.setHeader("RateLimit-Reset", String(resetSeconds))
}
