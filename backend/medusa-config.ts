import { loadEnv, defineConfig } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

const skipEnvCheck = process.env.MEDUSA_SKIP_ENV_CHECK === "true"

const REQUIRED_ENV = [
  "DATABASE_URL",
  "JWT_SECRET",
  "COOKIE_SECRET",
  "STORE_CORS",
  "ADMIN_CORS",
  "AUTH_CORS",
  "MEDUSA_BACKEND_URL",
] as const

if (!skipEnvCheck) {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]?.trim())
  if (missing.length) {
    throw new Error(`[medusa-config] Missing required environment variables: ${missing.join(", ")}`)
  }
}

export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL || "",
    http: {
      storeCors: process.env.STORE_CORS || "",
      adminCors: process.env.ADMIN_CORS || "",
      authCors: process.env.AUTH_CORS || "",
      jwtSecret: process.env.JWT_SECRET || "",
      cookieSecret: process.env.COOKIE_SECRET || "",
    },
  },

  admin: {
    backendUrl: process.env.MEDUSA_BACKEND_URL,
  },

  modules: {
    auth: {
      resolve: "@medusajs/medusa/auth",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/auth-emailpass",
            id: "emailpass",
          },
        ],
      },
    },
    payment: {
      resolve: "@medusajs/payment",
      options: {
        providers: [
          {
            resolve: "@medusajs/payment-stripe",
            id: "stripe",
            options: {
              apiKey: process.env.STRIPE_API_KEY,
              capture: true,
              webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
            },
          },
          {
            resolve: "@alphabite/medusa-paypal/providers/paypal",
            id: "paypal",
            options: {
              clientId: process.env.PAYPAL_CLIENT_ID,
              clientSecret: process.env.PAYPAL_CLIENT_SECRET,
              isSandbox: process.env.PAYPAL_IS_SANDBOX === "true",
            },
          },
        ],
      },
    },
    vendor: {
      resolve: "./src/modules/vendor",
    },
    subscription: {
      resolve: "./src/modules/subscription",
    },
    b2b: {
      resolve: "./src/modules/b2b",
    },
    bundle: {
      resolve: "./src/modules/bundle",
      definition: {
        isQueryable: true,
      },
    },
    digitalAsset: {
      resolve: "./src/modules/digital-asset",
      definition: {
        isQueryable: true,
      },
    },
  },
})
