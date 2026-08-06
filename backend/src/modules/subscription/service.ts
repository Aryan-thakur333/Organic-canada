import { MedusaService } from "@medusajs/framework/utils"
import { Subscription } from "./models/subscription"
import { SubscriptionPlan } from "./models/subscription-plan"
import { SubscriptionItem } from "./models/subscription-item"
import { SubscriptionBillingOrder } from "./models/subscription-order"
import { SubscriptionProviderEvent } from "./models/subscription-provider-event"
import { SubscriptionProductConfiguration } from "./models/subscription-product-configuration"

export default class SubscriptionModuleService extends MedusaService({
  Subscription,
  SubscriptionPlan,
  SubscriptionItem,
  SubscriptionBillingOrder,
  SubscriptionProviderEvent,
  SubscriptionProductConfiguration,
}) {}
