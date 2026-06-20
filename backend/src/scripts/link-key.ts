import { 
  linkSalesChannelsToApiKeyWorkflow 
} from "@medusajs/medusa/core-flows";

export default async function linkKey({ container }) {
  const apiKeyId = "apk_01KPTYFKXBH3P11D4T504S6NMK" // I'll need to find the internal ID first
  const channelId = "sc_01KPTYFKX5QA3XZHTDG4N5ESHM"
  
  // Actually I'll search for the key ID first
  const query = container.resolve("query")
  const { data } = await query.graph({
    entity: "api_key",
    fields: ["id"],
    filters: {
      token: "pk_f6e7283a1469dbd6b8a132839cdb54a154b20c2bf07fc5ef59cf0705e7ed2431"
    }
  })
  
  if (!data || !data.length) {
     console.error("COULD NOT FIND API KEY")
     return
  }
  
  const internalId = data[0].id
  console.log(`LINKING KEY ${internalId} TO CHANNEL ${channelId}`)

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: {
      id: internalId,
      add: [channelId],
    },
  });
  
  console.log("SUCCESSFULLY LINKED")
}
