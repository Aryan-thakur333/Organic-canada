import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import PosCashPaymentProviderService from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [PosCashPaymentProviderService],
})
