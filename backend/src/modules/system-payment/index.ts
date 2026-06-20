import SystemPaymentProvider from "./service"
import { ModuleProviderExports } from "@medusajs/framework/types"

const services: any[] = [SystemPaymentProvider]

const moduleDefinition: ModuleProviderExports = {
  services,
}

export default moduleDefinition
