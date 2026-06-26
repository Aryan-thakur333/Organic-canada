import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import FirebaseAuthProviderService from "./service"

export default ModuleProvider(Modules.AUTH, {
  services: [FirebaseAuthProviderService],
})
