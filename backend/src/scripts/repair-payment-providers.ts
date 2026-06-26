import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows"

const SYSTEM_PROVIDER_ID = "pp_system_default"
const STRIPE_PROVIDER_ID = "pp_stripe_stripe"
const PAYPAL_PROVIDER_ID = "pp_paypal_paypal"

export default async function repairPaymentProviders({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: providers } = await query.graph({
    entity: "payment_provider",
    fields: ["id", "is_enabled"],
  })
  const storedProviderIds = providers.map((provider: any) => provider.id)
  const desiredProviderIds = [SYSTEM_PROVIDER_ID]

  if (process.env.STRIPE_API_KEY) desiredProviderIds.push(STRIPE_PROVIDER_ID)
  else logger.warn("[payment-repair] Stripe skipped: STRIPE_API_KEY is missing")

  if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
    desiredProviderIds.push(PAYPAL_PROVIDER_ID)
  } else {
    logger.warn("[payment-repair] PayPal skipped: credentials are missing")
  }

  const unavailable = desiredProviderIds.filter((id) => !storedProviderIds.includes(id))
  if (unavailable.length) {
    throw new Error(`Configured provider(s) not registered after startup: ${unavailable.join(", ")}`)
  }

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "countries.iso_2", "payment_providers.id"],
  })
  const canadaRegions = regions.filter((region: any) =>
    region.countries?.some((country: any) => country.iso_2?.toLowerCase() === "ca")
  )
  if (!canadaRegions.length) throw new Error("No Canada region exists")

  for (const region of canadaRegions) {
    const current = region.payment_providers?.map((provider: any) => provider.id) || []
    const finalProviderIds = [...new Set([...current, ...desiredProviderIds])]
    await updateRegionsWorkflow(container).run({
      input: {
        selector: { id: region.id },
        update: {
          // @ts-ignore Remote payment-provider IDs are accepted by the workflow.
          payment_providers: finalProviderIds,
        },
      },
    })
    logger.info(JSON.stringify({
      event: "canada_payment_providers_repaired",
      region_id: region.id,
      region_name: region.name,
      payment_provider_ids: finalProviderIds,
    }))
  }
}
