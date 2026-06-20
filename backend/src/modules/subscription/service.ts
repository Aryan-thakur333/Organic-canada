import { MedusaService } from "@medusajs/framework/utils"
import { Subscription } from "./models/subscription"

export default class SubscriptionModuleService extends MedusaService({
  Subscription,
}) {}
