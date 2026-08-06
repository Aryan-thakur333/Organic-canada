import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createSalesChannelsWorkflow, linkSalesChannelsToStockLocationWorkflow } from "@medusajs/medusa/core-flows"

export default async function setupPosChannel({ container }) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const salesChannelService = container.resolve(Modules.SALES_CHANNEL)
  const stockLocationService = container.resolve(Modules.STOCK_LOCATION)

  let [channel] = await salesChannelService.listSalesChannels({ name: "POS" }, { take: 1 })

  if (!channel) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: {
        salesChannelsData: [
          {
            name: "POS",
            description: "Point of Sale in-store channel",
            is_disabled: false,
          },
        ],
      },
    })
    channel = result[0]
    logger.info(`Created POS sales channel: ${channel.id}`)
  } else {
    logger.info(`Found POS sales channel: ${channel.id}`)
  }

  const locations = await stockLocationService.listStockLocations({}, { take: 50 })
  for (const location of locations) {
    try {
      await linkSalesChannelsToStockLocationWorkflow(container).run({
        input: { id: location.id, add: [channel.id] },
      })
      logger.info(`Linked POS channel to stock location: ${location.name} (${location.id})`)
    } catch (error: any) {
      logger.info(`POS channel link skipped for ${location.id}: ${error.message}`)
    }
  }

  logger.info(`sales_channel_id=${channel.id}`)
}
