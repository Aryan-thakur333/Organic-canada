import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createRegionsWorkflow } from "@medusajs/medusa/core-flows"

export default async function ensureDefaultRegion({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const regionModuleService = container.resolve(Modules.REGION)

  const existingRegions = await regionModuleService.listRegions({}, { take: 1 })

  if (existingRegions.length) {
    logger.info(`Default region already available: ${existingRegions[0].id}`)
    return
  }

  const defaultPaymentProviders = ["pp_system_default"];
  if (process.env.STRIPE_API_KEY) {
    defaultPaymentProviders.push("pp_stripe_stripe");
  }
  if (process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) {
    defaultPaymentProviders.push("pp_paypal_paypal");
  }
  logger.info(`Default region payment providers: ${defaultPaymentProviders.join(", ")}`);
  const { result } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "Default Region",
          currency_code: "eur",
          countries: ["de"],
          payment_providers: defaultPaymentProviders,
        },
      ],
    },
  })

  logger.info(`Created default region: ${result[0].id}`)
}
