import { defineMiddlewares } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"
import { getClientIp, checkRateLimit, setRateLimitHeaders, rateLimitBuckets } from "./utils/rate-limit"
import { setHstsHeader } from "./utils/security"
import { shippingDiagnostics } from "./utils/shipping-diagnostics"
import {
  commerceFeatureDisabledBody,
  isCommerceFeatureEnabled,
  type CommerceFeature,
} from "../lib/commerce-feature-flags"
import { releaseBundleCartReservations, reserveBundleCartComponents } from "../modules/bundle/utils/reservations"

function requireCommerceFeature(feature: CommerceFeature) {
  return async (_req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) => {
    if (!isCommerceFeatureEnabled(feature)) {
      return res.status(404).json(commerceFeatureDisabledBody(feature))
    }
    return next()
  }
}

async function bundleCheckoutReservations(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  if (!isCommerceFeatureEnabled("bundled_products")) return next()
  const cartId = req.params.id
  try {
    await reserveBundleCartComponents(req.scope, cartId)
    res.on("finish", () => {
      if (res.statusCode >= 400) void releaseBundleCartReservations(req.scope, cartId).catch(() => undefined)
    })
    return next()
  } catch (error: any) {
    if (error?.code === "BUNDLE_SNAPSHOT_NOT_FOUND" || error?.code === "BUNDLE_SNAPSHOT_DUPLICATE" || error?.code === "BUNDLE_COMPONENT_MISMATCH" || error?.code === "BUNDLE_PRICE_MISMATCH" || error?.code === "BUNDLE_RESERVATION_MISMATCH") {
      return res.status(409).json({
        code: "BUNDLE_CART_REBUILD_REQUIRED",
        message: "Your bundle cart was created with an older configuration. Rebuild cart before continuing.",
        details: error?.details,
      })
    }
    return res.status(Number(error?.status) || 409).json({
      code: error?.code || "BUNDLE_INVENTORY_UNAVAILABLE",
      message: error.message || "Bundle component inventory is unavailable",
      details: error?.details,
    })
  }
}

async function enforceCartFeatureCompatibility(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  try {
    const cartService: any = req.scope.resolve(Modules.CART)
    const cart = await cartService.retrieveCart(req.params.id, { relations: ["items"] })
    const items = cart.items || []
    if (items.some((item: any) => item.metadata?.is_subscription === true || item.metadata?.subscription_interval)) {
      return res.status(409).json({ code: "SUBSCRIPTION_CHECKOUT_REQUIRED", message: "Recurring items must use the dedicated subscription checkout and cannot be mixed with one-time checkout." })
    }
    const hasBundleItem = items.some(
      (item: any) =>
        item.metadata?.is_bundle === true ||
        item.metadata?.commerce_type === "FIXED_BUNDLE_COMPONENT"
    )
    const hasPersonalization = items.some((item: any) => item.metadata?.custom_personalization === true)
    if (hasBundleItem && hasPersonalization) {
      return res.status(422).json({ code: "UNSUPPORTED_COMMERCE_COMBINATION", message: "Personalized bundles are not supported." })
    }
    return next()
  } catch (error: any) {
    return res.status(404).json({ message: error.message || "Cart not found" })
  }
}

function applyAdminNoStorePolicy(req: MedusaRequest, res: MedusaResponse): void {
  delete req.headers["if-none-match"]
  delete req.headers["if-modified-since"]
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
  res.setHeader("Pragma", "no-cache")
  res.setHeader("Expires", "0")
  res.setHeader("Surrogate-Control", "no-store")
}

async function adminNoStoreAuthenticated(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  applyAdminNoStorePolicy(req, res)
  return authenticateAdminUser(req, res, next)
}

async function securityHeaders(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const requestPath = (req.originalUrl || req.url || req.path || "").split("?")[0]

  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'"
  );
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin")
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

  // Prevent caching of Admin app entry HTML and build metadata, but keep hashed assets cacheable
  if ((requestPath.startsWith("/app") || requestPath === "/app") && !requestPath.startsWith("/app/assets/")) {
    if (requestPath.includes("eatsie-build.json") || requestPath.includes("build-id.json")) {
      res.setHeader("Cache-Control", "no-store");
    } else {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
  }

  // HSTS — instruct browsers to always use HTTPS (1 year, include subdomains)
  // Protected Admin responses must reflect the current session instead of being
  // satisfied by a stale conditional cache entry. Removing validators also keeps
  // authentication acceptance checks explicit (200/401) rather than 304.
  if (requestPath.startsWith("/admin/")) {
    applyAdminNoStorePolicy(req, res)
  }

  setHstsHeader(res, process.env.NODE_ENV)

  // Fake response for Chrome DevTools to stop 404 logs and satisfying CSP
  if (requestPath === "/.well-known/appspecific/com.chrome.devtools.json") {
    return res.json({
      devtools: {
        host: "localhost:9000",
      },
    });
  }

  next();
}

/**
 * Fixes CORS preflight issues where OPTIONS requests might be blocked by 
 * publishable key requirements or other middleware.
 */
export async function corsPreflightFix(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const allowedOrigins = [
    process.env.STORE_CORS,
    process.env.ADMIN_CORS,
    process.env.AUTH_CORS,
  ]
    .filter((v): v is string => typeof v === "string")
    .flatMap((v) => v.split(","))
    .map((s) => s.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV !== "production") allowedOrigins.push("http://localhost:5173")

  const origin = req.headers.origin || "";
  const isAllowed = allowedOrigins.some((o) => origin === o) || allowedOrigins.includes("*");

  if (isAllowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key, x-publishable-api-key, x-medusa-access-token");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.status(204).send();
  }
  next();
}

import { authenticateVendor } from "./vendor/auth"
import { authenticate } from "@medusajs/framework/http"
import {
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import {
  CreateQuote,
  CreateB2BQuote,
  GetQuoteParams,
  listStoreQuoteQueryConfig,
} from "./store/validators"

const authenticateAdminUser = authenticate("user", ["session", "bearer"])

function isLocalDevelopment(): boolean {
  return process.env.NODE_ENV !== "production"
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function clearAuthRateLimitBuckets(): number {
  let cleared = 0

  for (const key of rateLimitBuckets.keys()) {
    if (key.startsWith("auth:")) {
      rateLimitBuckets.delete(key)
      cleared++
    }
  }

  return cleared
}

// ── Rate limiting is now imported from ./utils/rate-limit ─────────────

async function authRateLimit(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const requestPath = (req.originalUrl || req.url || req.path || "").split("?")[0]

  if (
    isLocalDevelopment() &&
    (req.path === "/auth/dev/reset-rate-limit" || requestPath === "/auth/dev/reset-rate-limit")
  ) {
    const cleared = clearAuthRateLimitBuckets()
    return res.status(200).json({ message: "Auth rate limit buckets reset.", cleared })
  }

  const windowMs = isLocalDevelopment()
    ? readPositiveInteger(process.env.DEV_AUTH_RATE_LIMIT_WINDOW_MS, 60 * 1000)
    : 15 * 60 * 1000
  const maxRequests = isLocalDevelopment()
    ? readPositiveInteger(process.env.DEV_AUTH_RATE_LIMIT_MAX, 100)
    : 10
  const ip = getClientIp(req)
  const key = `auth:${ip}:${req.path}`
  const { allowed, remaining, resetAt } = checkRateLimit(key, maxRequests, windowMs)

  setRateLimitHeaders(res, maxRequests, remaining, resetAt)

  if (!allowed) {
    res.setHeader("Retry-After", String(Math.ceil((resetAt - Date.now()) / 1000)))
    return res.status(429).json({ message: "Too many authentication attempts. Try again later." })
  }

  res.on("finish", () => {
    if (res.statusCode < 400) {
      rateLimitBuckets.delete(key)
    }
  })

  next()
}

// 60 requests/minute for general store and vendor non-auth endpoints
async function generalRateLimit(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const windowMs = 60 * 1000 // 1 minute
  const maxRequests = 60
  const ip = getClientIp(req)
  const vendorId = (req as any).vendor?.id
  const customerId = (req as any).auth_context?.actor_id
  const subject = vendorId || customerId || ip
  const key = `general:${subject}:${req.method}:${req.path?.split("?")[0] || ""}`
  const { allowed, remaining, resetAt } = checkRateLimit(key, maxRequests, windowMs)

  setRateLimitHeaders(res, maxRequests, remaining, resetAt)

  if (!allowed) {
    res.setHeader("Retry-After", String(Math.ceil((resetAt - Date.now()) / 1000)))
    return res.status(429).json({ message: "Too many requests. Please slow down." })
  }
  next()
}

async function posBarcodeLookupRateLimit(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const windowMs = 60 * 1000
  const maxRequests = 120
  const key = `pos-barcode:${getClientIp(req)}`
  const { allowed, remaining, resetAt } = checkRateLimit(key, maxRequests, windowMs)
  setRateLimitHeaders(res, maxRequests, remaining, resetAt)
  if (!allowed) {
    res.setHeader("Retry-After", String(Math.ceil((resetAt - Date.now()) / 1000)))
    return res.status(429).json({ code: "POS_LOOKUP_RATE_LIMITED", message: "Too many barcode lookups. Try again shortly." })
  }
  next()
}

/**
 * Generate a short unique request ID for tracing.
 */
function requestId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/**
 * Structured request logger — logs all HTTP requests with consistent JSON.
 * Never logs request bodies, credentials, addresses, or customer data.
 *
 * Adds an X-Request-Id header to every response for tracing.
 */
async function requestLoggingMiddleware(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const urlPath = req.originalUrl || req.url || req.path || ""
  const rid = requestId()

  // Attach request ID for client-side tracing
  res.setHeader("X-Request-Id", rid)

  // Health check probes are too noisy to log
  if (urlPath === "/health" || urlPath === "/health?probe=true") {
    return next()
  }

  const startedAt = Date.now()
  res.on("finish", () => {
    const duration = Date.now() - startedAt
    const entry: Record<string, any> = {
      event: "http_request",
      request_id: rid,
      method: req.method,
      path: urlPath.split("?")[0],
      status: res.statusCode,
      duration_ms: duration,
    }

    // Add rate limit headers when present
    const rateLimit = res.getHeader("RateLimit-Remaining")
    if (rateLimit !== undefined) {
      entry.rate_limit_remaining = Number(rateLimit)
    }

    // Slow requests (over 2s) get a warning flag
    if (duration > 2000) {
      entry.slow = true
    }

    // Error responses (4xx/5xx) get logged at a higher level
    if (res.statusCode >= 500) {
      console.error(JSON.stringify(entry))
    } else if (res.statusCode >= 400) {
      console.warn(JSON.stringify(entry))
    } else {
      console.log(JSON.stringify(entry))
    }
  })

  next();
}

export default defineMiddlewares({
  routes: [
    {
      method: ["GET"],
      matcher: "/store/shipping-options",
      middlewares: [shippingDiagnostics],
    },
    {
      method: ["POST"],
      matcher: "/store/carts/:id/complete",
      middlewares: [shippingDiagnostics],
    },
    {
      method: ["POST"],
      matcher: "/auth/*",
      middlewares: [authRateLimit],
    },
    {
      method: ["POST"],
      matcher: "/vendor/login",
      middlewares: [authRateLimit],
    },
    {
      method: ["POST"],
      matcher: "/vendor/register",
      middlewares: [authRateLimit],
    },
    {
      method: ["POST"],
      matcher: "/vendor/account-type",
      middlewares: [authRateLimit],
    },
    {
      matcher: "/vendor/*",
      middlewares: [authenticateVendor],
    },
    {
      matcher: "/store/*",
      middlewares: [generalRateLimit],
    },
    {
      matcher: "/vendor/*",
      middlewares: [generalRateLimit],
    },
    {
      matcher: "*",
      middlewares: [corsPreflightFix, securityHeaders, requestLoggingMiddleware],
    },
    {
      matcher: "/store/subscriptions*",
      middlewares: [requireCommerceFeature("subscriptions")],
    },
    {
      method: ["POST"],
      matcher: "/store/webhooks/stripe",
      bodyParser: { preserveRawBody: true },
    },
    {
      matcher: "/store/subscription-plans*",
      middlewares: [requireCommerceFeature("subscriptions")],
    },
    {
      matcher: "/store/customers/me/subscriptions*",
      middlewares: [requireCommerceFeature("subscriptions")],
    },
    {
      matcher: "/admin/subscriptions*",
      middlewares: [requireCommerceFeature("subscriptions")],
    },
    {
      matcher: "/admin/subscription-plans*",
      middlewares: [requireCommerceFeature("subscriptions")],
    },
    {
      matcher: "/admin/subscription-configurations*",
      middlewares: [requireCommerceFeature("subscriptions")],
    },
    {
      matcher: "/store/products/*/subscription-options*",
      middlewares: [requireCommerceFeature("subscriptions")],
    },
    {
      matcher: "/store/products/*/personalization*",
      middlewares: [requireCommerceFeature("personalized_products")],
    },
    {
      matcher: "/store/personalizations*",
      middlewares: [requireCommerceFeature("personalized_products")],
    },
    {
      matcher: "/store/carts/*/line-items/personalized*",
      middlewares: [requireCommerceFeature("personalized_products")],
    },
    {
      matcher: "/store/carts/*/line-items/*/personalization*",
      middlewares: [requireCommerceFeature("personalized_products")],
    },
    {
      matcher: "/admin/personalization-templates*",
      middlewares: [requireCommerceFeature("personalized_products")],
    },
    {
      matcher: "/admin/personalization-assets*",
      middlewares: [requireCommerceFeature("personalized_products")],
    },
    {
      matcher: "/admin/orders/*/personalizations*",
      middlewares: [requireCommerceFeature("personalized_products")],
    },
    {
      matcher: "/admin/orders/*/bundle-snapshots*",
      middlewares: [requireCommerceFeature("bundled_products")],
    },
    {
      matcher: "/vendor/personalization-templates*",
      middlewares: [requireCommerceFeature("personalized_products")],
    },
    {
      matcher: "/vendor/orders/*/items/*/personalization*",
      middlewares: [requireCommerceFeature("personalized_products")],
    },
    {
      matcher: "/store/bundles*",
      middlewares: [requireCommerceFeature("bundled_products")],
    },
    {
      method: ["POST"],
      matcher: "/store/carts/:id/bundled-line-items",
      middlewares: [requireCommerceFeature("bundled_products")],
    },
    {
      method: ["DELETE"],
      matcher: "/store/carts/:id/bundled-line-items/:bundleGroupId",
      middlewares: [requireCommerceFeature("bundled_products")],
    },
    {
      method: ["POST"],
      matcher: "/store/carts/:id/complete",
      middlewares: [enforceCartFeatureCompatibility, bundleCheckoutReservations],
    },
    {
      matcher: "/admin/bundles*",
      middlewares: [requireCommerceFeature("bundled_products")],
    },
    {
      method: ["POST"],
      matcher: "/admin/products/digital",
      bodyParser: false,
      middlewares: [adminNoStoreAuthenticated],
    },
    {
      matcher: "/admin/*",
      middlewares: [adminNoStoreAuthenticated],
    },

    {
      method: ["POST"],
      matcher: "/store/orders/claim",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      matcher: "/admin/bundles/*",
      middlewares: [authenticate("admin", ["session", "bearer"])],
    },
    {
      matcher: "/store/subscriptions*",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      matcher: "/store/personalizations/uploads*",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      matcher: "/store/customers/me/subscriptions",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      matcher: "/store/b2b*",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      method: ["POST"],
      matcher: "/store/customers/me/quotes",
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
        validateAndTransformBody(CreateQuote),
      ],
    },
    {
      method: ["GET"],
      matcher: "/store/customers/me/quotes*",
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
        validateAndTransformQuery(GetQuoteParams, listStoreQuoteQueryConfig as any),
      ],
    },
    {
      method: ["POST"],
      matcher: "/store/b2b/quotes",
      middlewares: [validateAndTransformBody(CreateB2BQuote)],
    },
    {
      method: ["GET", "POST"],
      matcher: "/store/downloads/*",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      method: ["GET"],
      matcher: "/store/customers/me/downloads",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      matcher: "/store/customers/me/oms/orders*",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    // POS is a bearer-token-only client (token held in localStorage). Session
    // auth MUST NOT be accepted here: Medusa's authenticate() tries the session
    // strategy FIRST, so a stale admin-dashboard session cookie (ADMIN_AUTH_TYPE
    // = session) would authenticate /pos/* as that admin and silently override
    // the POS bearer token's actor_id, returning another admin's bootstrap
    // operator (POS_ACTOR_MISMATCH on the frontend). Bearer-only guarantees the
    // POS actor always comes from the POS login token.
    {
      matcher: "/pos/*",
      middlewares: [authenticate("user", ["bearer"])],
    },
    {
      method: ["GET"],
      matcher: "/pos/products/lookup",
      middlewares: [posBarcodeLookupRateLimit],
    },
    {
      matcher: "/store/pos/*",
      middlewares: [authenticate("user", ["bearer"])],
    },
    {
      method: ["GET"],
      matcher: "/store/orders/downloads",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
  ],
})
