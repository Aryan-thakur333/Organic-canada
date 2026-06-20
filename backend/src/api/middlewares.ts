import { defineMiddlewares } from "@medusajs/framework/http"
import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http";

/**
 * Fixes Chrome DevTools CSP noise and provides more relaxed headers for local development.
 */
async function devToolsCspFix(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  // Relax CSP to allow DevTools connections and local storefront interaction
  res.setHeader(
    "Content-Security-Policy",
    "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; frame-ancestors 'self';"
  );

  // Fake response for Chrome DevTools to stop 404 logs and satisfying CSP
  if (req.path === "/.well-known/appspecific/com.chrome.devtools.json") {
    return res.json({
      devtools: {
        host: "localhost:9000",
      },
    });
  }

  // Intercept root GET requests to return healthy status and prevent 404s
  if (req.path === "/") {
    return res.json({
      status: "ok",
      message: "Medusa Backend is running",
      documentation: "https://docs.medusajs.com"
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
  } else if (allowedOrigins.length > 0) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigins[0]);
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

/**
 * Global authentication and cart assignment request logger.
 */
async function requestLoggingMiddleware(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const urlPath = req.originalUrl || req.url || req.path || "";

  if (urlPath.includes("/auth/customer/emailpass") || urlPath.includes("/store/customers")) {
    console.log(`[Backend Auth Log] Method: ${req.method} | URL: ${urlPath}`);
    if (req.body) {
      const { email, password, ...rest } = req.body as any;
      console.log(`[Backend Auth Log] Payload details:`, { email, ...rest });
    }
  }

  if (urlPath.includes("/store/carts")) {
    console.log(`[Backend Cart Log] Method: ${req.method} | URL: ${urlPath}`);
    if (req.body) {
      console.log(`[Backend Cart Log] Payload details:`, req.body);
    }
  }

  if (urlPath.includes("/store/orders")) {
    console.log(`[Backend Order Log] Method: ${req.method} | URL: ${urlPath}`);
    if (req.body) {
      console.log(`[Backend Order Log] Payload details:`, req.body);
    }
  }

  next();
}

export default defineMiddlewares({
  routes: [
    {
      matcher: "*",
      middlewares: [corsPreflightFix, devToolsCspFix, requestLoggingMiddleware],
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
      middlewares: [authenticate("admin", ["session", "bearer"])],
    },
  ],
})
