
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

export default async function debugProviders({ container }) {
  const paymentModuleService = container.resolve(Modules.PAYMENT);
  const providers = await paymentModuleService.listPaymentProviders();
  console.log('Available Payment Providers:', JSON.stringify(providers, null, 2));
}
