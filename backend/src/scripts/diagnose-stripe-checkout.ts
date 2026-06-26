import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

const STRIPE_PROVIDER_ID = "pp_stripe_stripe"

export default async function diagnoseStripeCheckout({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const paymentService: any = container.resolve(Modules.PAYMENT)

  const providers = await paymentService.listPaymentProviders()
  const providerIds = providers.map((provider: any) => provider.id)
  const runtimeProviderIds = providerIds.filter((providerId: string) => {
    if (providerId.startsWith("pp_stripe")) return Boolean(process.env.STRIPE_API_KEY)
    if (providerId.includes("paypal")) {
      return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET)
    }
    return providerId === "pp_system_default"
  })
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "currency_code", "countries.iso_2", "payment_providers.id"],
  })

  const canadaRegions = regions.filter((region: any) =>
    region.countries?.some((country: any) => country.iso_2?.toLowerCase() === "ca")
  )
  const env = {
    STRIPE_API_KEY: Boolean(process.env.STRIPE_API_KEY),
    STRIPE_WEBHOOK_SECRET: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    STRIPE_CAPTURE: process.env.STRIPE_CAPTURE || "true (default)",
    MEDUSA_BACKEND_URL: Boolean(process.env.MEDUSA_BACKEND_URL),
    STORE_CORS: Boolean(process.env.STORE_CORS),
    ADMIN_CORS: Boolean(process.env.ADMIN_CORS),
    AUTH_CORS: Boolean(process.env.AUTH_CORS),
  }

  logger.info(JSON.stringify({
    event: "stripe_checkout_configuration",
    environment: env,
    registered_payment_provider_ids: providerIds,
    runtime_payment_provider_ids: runtimeProviderIds,
    regions: regions.map((region: any) => ({
      id: region.id,
      name: region.name,
      currency_code: region.currency_code,
      payment_provider_ids: region.payment_providers?.map((provider: any) => provider.id) || [],
    })),
  }))

  const cartId = process.env.CART_ID
  if (cartId) {
    const { data: carts } = await query.graph({
      entity: "cart",
      fields: [
        "id",
        "region_id",
        "email",
        "currency_code",
        "total",
        "shipping_address.id",
        "shipping_methods.id",
        "payment_collection.id",
        "payment_collection.amount",
        "payment_collection.currency_code",
        "payment_collection.payment_sessions.id",
        "payment_collection.payment_sessions.provider_id",
        "payment_collection.payment_sessions.status",
        "payment_collection.payment_sessions.data",
      ],
      filters: { id: cartId },
    })
    const cart: any = carts[0]
    logger.info(JSON.stringify({
      event: "stripe_cart_diagnostics",
      cart_id: cartId,
      found: Boolean(cart),
      region_id: cart?.region_id,
      has_email: Boolean(cart?.email),
      has_shipping_address: Boolean(cart?.shipping_address?.id),
      shipping_method_ids: cart?.shipping_methods?.map((method: any) => method.id) || [],
      payment_collection: cart?.payment_collection ? {
        id: cart.payment_collection.id,
        amount: cart.payment_collection.amount,
        currency_code: cart.payment_collection.currency_code,
        sessions: cart.payment_collection.payment_sessions?.map((session: any) => ({
          id: session.id,
          provider_id: session.provider_id,
          status: session.status,
          has_client_secret: Boolean(session.data?.client_secret),
        })) || [],
      } : null,
    }))
  } else {
    logger.info("[stripe-diagnostics] Set CART_ID to audit a specific cart and payment collection")
  }

  const registered = runtimeProviderIds.includes(STRIPE_PROVIDER_ID)
  const linkedCanadaRegionIds = canadaRegions
    .filter((region: any) => region.payment_providers?.some((provider: any) => provider.id === STRIPE_PROVIDER_ID))
    .map((region: any) => region.id)

  logger.info(JSON.stringify({
    event: "stripe_canada_readiness",
    stripe_provider_id: STRIPE_PROVIDER_ID,
    provider_registered: registered,
    canada_region_ids: canadaRegions.map((region: any) => region.id),
    linked_canada_region_ids: linkedCanadaRegionIds,
    ready: Boolean(process.env.STRIPE_API_KEY) && registered && canadaRegions.length > 0 &&
      linkedCanadaRegionIds.length === canadaRegions.length,
  }))

  if (!process.env.STRIPE_API_KEY) {
    throw new Error("STRIPE_API_KEY is missing; Stripe cannot be registered")
  }
  if (!registered) throw new Error(`${STRIPE_PROVIDER_ID} is not registered in the Payment Module`)
  if (!canadaRegions.length) throw new Error("No Canada region exists")
  if (linkedCanadaRegionIds.length !== canadaRegions.length) {
    throw new Error("Stripe is not enabled for every Canada checkout region")
  }
}
