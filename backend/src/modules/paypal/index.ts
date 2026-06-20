import PaypalProviderService from "./service"
import { ModuleProviderExports } from "@medusajs/framework/types"

const services = [PaypalProviderService]

const moduleDefinition: ModuleProviderExports = {
  services,
}

export default moduleDefinition
