export default async function listChannels({ container }) {
  const salesChannelService = container.resolve("salesChannelModuleService")
  const publishableKeyService = container.resolve("publishableKeyModuleService")

  const channels = await salesChannelService.listSalesChannels()
  console.log("SALES CHANNELS:")
  channels.forEach(c => console.log(`- ${c.name}: ${c.id}`))

  const keys = await publishableKeyService.listPublishableKeys()
  console.log("\nPUBLISHABLE KEYS:")
  for (const key of keys) {
    const linkedChannels = await publishableKeyService.listPublishableKeySalesChannels({
      publishable_key_id: key.id
    })
    console.log(`- ${key.title} (${key.id}): ${key.token.substring(0, 10)}...`)
    linkedChannels.forEach(lc => console.log(`  -> Linked to Channel ID: ${lc.sales_channel_id}`))
  }
}
