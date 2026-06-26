import { MedusaService } from "@medusajs/framework/utils"
import { Subscription } from "./models/subscription"
import { SubscriptionPlan } from "./models/subscription-plan"

export default class SubscriptionModuleService extends MedusaService({
  Subscription,
  SubscriptionPlan,
}) {}
