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

  const { result } = await createRegionsWorkflow(container).run({
    input: {
      regions: [
        {
          name: "Default Region",
          currency_code: "eur",
          countries: ["de"],
          payment_providers: ["pp_system_default"],
        },
      ],
    },
  })

  logger.info(`Created default region: ${result[0].id}`)
}
