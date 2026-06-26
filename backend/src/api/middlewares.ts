import { defineMiddlewares } from "@medusajs/framework/http"
import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http"
import { getClientIp, checkRateLimit, setRateLimitHeaders } from "./utils/rate-limit"
import { setHstsHeader } from "./utils/security"
import { shippingDiagnostics } from "./utils/shipping-diagnostics"

async function securityHeaders(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'"
  );
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin")
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

  // HSTS — instruct browsers to always use HTTPS (1 year, include subdomains)
  setHstsHeader(res, process.env.NODE_ENV)

  // Fake response for Chrome DevTools to stop 404 logs and satisfying CSP
  if (req.path === "/.well-known/appspecific/com.chrome.devtools.json") {
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
async function corsPreflightFix(
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

  const origin = req.headers.origin || "";
  const isAllowed = allowedOrigins.some((o) => origin === o) || allowedOrigins.includes("*");

  if (isAllowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-publishable-api-key, x-medusa-access-token");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.status(204).send();
  }
  next();
}

import { authenticateVendor } from "./vendor/auth"
import { authenticate } from "@medusajs/framework/http"

// ── Rate limiting is now imported from ./utils/rate-limit ─────────────

async function authRateLimit(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const windowMs = 15 * 60 * 1000
  const maxRequests = 10
  const ip = getClientIp(req)
  const key = `auth:${ip}:${req.path}`
  const { allowed, remaining, resetAt } = checkRateLimit(key, maxRequests, windowMs)

  setRateLimitHeaders(res, maxRequests, remaining, resetAt)

  if (!allowed) {
    res.setHeader("Retry-After", String(Math.ceil((resetAt - Date.now()) / 1000)))
    return res.status(429).json({ message: "Too many authentication attempts. Try again later." })
  }
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
  const key = `general:${ip}:${req.method}:${req.path?.split("?")[0] || ""}`
  const { allowed, remaining, resetAt } = checkRateLimit(key, maxRequests, windowMs)

  setRateLimitHeaders(res, maxRequests, remaining, resetAt)

  if (!allowed) {
    res.setHeader("Retry-After", String(Math.ceil((resetAt - Date.now()) / 1000)))
    return res.status(429).json({ message: "Too many requests. Please slow down." })
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
      matcher: "/admin/*",
      middlewares: [authenticate("user", ["session", "bearer"])],
    },
    {
      matcher: "/vendor/*",
      middlewares: [authenticateVendor],
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
      method: ["POST"],
      matcher: "/admin/products/digital",
      bodyParser: false,
      middlewares: [authenticate("user", ["session", "bearer"])],
    },
    {
      matcher: "/store/subscriptions*",
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
      method: ["GET"],
      matcher: "/store/downloads/*",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
  ],
})
