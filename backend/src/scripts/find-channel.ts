import { 
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils";

export default async function listChannels({ container }) {
  const salesChannelModuleService = container.resolve(Modules.SALES_CHANNEL);
  const channels = await salesChannelModuleService.listSalesChannels({
    name: "Default Sales Channel",
  });
  
  if (channels.length) {
    console.log(`DEFAULT_CHANNEL_ID=${channels[0].id}`);
  } else {
    const all = await salesChannelModuleService.listSalesChannels();
    console.log("ALL_CHANNELS:");
    all.forEach(c => console.log(`${c.name}=${c.id}`));
  }
}
