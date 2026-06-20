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
    .filter(Boolean)
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

export default defineMiddlewares({
  routes: [
    {
      matcher: "*",
      middlewares: [corsPreflightFix, devToolsCspFix],
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
  ],
})
