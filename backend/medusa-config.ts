import { loadEnv, defineConfig } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

const skipEnvCheck = process.env.MEDUSA_SKIP_ENV_CHECK === "true"
const stripeConfigured = Boolean(process.env.STRIPE_API_KEY)
const paypalConfigured = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET)

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
  const productionRequired = process.env.NODE_ENV === "production" ? ["REDIS_URL"] : []
  const missing = [...REQUIRED_ENV, ...productionRequired].filter((key) => !process.env[key]?.trim())
  if (missing.length) {
    throw new Error(`[medusa-config] Missing required environment variables: ${missing.join(", ")}`)
  }

  // Validate secret length — Medusa requires 32+ chars for both
  const secretsToCheck: { key: string; value: string | undefined }[] = [
    { key: "JWT_SECRET", value: process.env.JWT_SECRET },
    { key: "COOKIE_SECRET", value: process.env.COOKIE_SECRET },
  ]

  for (const { key, value } of secretsToCheck) {
    if (value && value.length < 32) {
      console.error(`[medusa-config] ❌ ${key} is only ${value.length} characters long (minimum 32 required).`)
      console.error(`[medusa-config]    Run:  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
      console.error(`[medusa-config]    to generate a secure ${key} on your machine.`)
      console.error(`[medusa-config]    Then update your .env file with the new value.`)
      throw new Error(`[medusa-config] ${key} must contain at least 32 characters (found ${value.length})`)
    }
  }

  if (!stripeConfigured) {
    console.warn("[medusa-config] Stripe is disabled: STRIPE_API_KEY is not configured. COD remains available.")
  } else if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.warn("[medusa-config] Stripe webhook verification is disabled: STRIPE_WEBHOOK_SECRET is missing.")
  }
  if (!paypalConfigured) {
    console.warn("[medusa-config] PayPal is disabled: PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET is missing. COD remains available.")
  }
}

export default defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL || "",
    databaseDriverOptions: process.env.DATABASE_SSL === "true"
      ? {
          connection: {
            ssl: {
              rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false",
            },
          },
        }
      : undefined,
    redisUrl: process.env.REDIS_URL,
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
          {
            resolve: "./src/modules/firebase-auth",
            id: "firebase",
            options: {
              projectId: process.env.FIREBASE_PROJECT_ID || "organic-canada-2512b",
              clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
              privateKey: process.env.FIREBASE_PRIVATE_KEY,
            },
          },
        ],
      },
    },
    payment: {
      resolve: "@medusajs/payment",
      options: {
        providers: [
          ...(stripeConfigured ? [{
            resolve: "@medusajs/payment-stripe",
            id: "stripe",
            options: {
              apiKey: process.env.STRIPE_API_KEY,
              capture: process.env.STRIPE_CAPTURE?.toLowerCase() !== "false",
              webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
            },
          }] : []),
          ...(paypalConfigured ? [{
            resolve: "@alphabite/medusa-paypal/providers/paypal",
            id: "paypal",
            options: {
              clientId: process.env.PAYPAL_CLIENT_ID,
              clientSecret: process.env.PAYPAL_CLIENT_SECRET,
              isSandbox: process.env.PAYPAL_ENV?.toLowerCase() === "sandbox" ||
                process.env.PAYPAL_IS_SANDBOX === "true",
              webhookId: process.env.PAYPAL_WEBHOOK_ID,
              includeShippingData: true,
              includeCustomerData: true,
            },
          }] : []),
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
