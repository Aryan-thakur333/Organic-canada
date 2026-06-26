import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

/**
 * GET /health — Health check endpoint that reports backend status.
 *
 * Lightweight ping (no DB call) via query param `?probe=true`.
 * Full health check (DB, Redis, modules) via `?full=true`.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const probe = req.query?.probe === "true"
  const full = req.query?.full === "true"

  // ── Probe mode: simplest possible ping (no DI resolution) ───────────
  if (probe) {
    return res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
    })
  }

  // ── Basic health (lightweight) ───────────────────────────────────────
  const basic: Record<string, any> = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    node: process.version,
    env: process.env.NODE_ENV || "development",
  }

  // ── Full health — check dependencies ────────────────────────────────
  if (full) {
    const checks: Record<string, any> = {}
    let allHealthy = true

    // PostgreSQL ping using Medusa's existing Knex connection.
    try {
      const connection = req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION)
      await connection.raw("select 1")
      checks.database = { status: "ok" }
    } catch (err: any) {
      checks.database = { status: "error", message: err.message }
      allHealthy = false
    }

    // Redis ping
    try {
      const redisUrl = process.env.REDIS_URL
      if (redisUrl) {
        checks.redis = { status: "configured" }
      } else {
        checks.redis = { status: "fallback", message: "Using Medusa in-memory fallback" }
      }
    } catch (err: any) {
      checks.redis = { status: "error", message: err.message }
      allHealthy = false
    }

    // Stripe check
    try {
      const stripeKey = process.env.STRIPE_API_KEY
      if (stripeKey) {
        checks.stripe = { status: "configured", message: "STRIPE_API_KEY is set" }
      } else {
        checks.stripe = { status: "skipped", message: "STRIPE_API_KEY not set" }
      }
    } catch (err: any) {
      checks.stripe = { status: "error", message: err.message }
      allHealthy = false
    }

    basic.checks = checks
    basic.healthy = allHealthy
  }

  const statusCode = basic.healthy === false ? 503 : 200
  return res.status(statusCode).json(basic)
}
