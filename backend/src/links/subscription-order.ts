import SubscriptionModule from "../modules/subscription"
import OrderModule from "@medusajs/medusa/order"
import { defineLink } from "@medusajs/framework/utils"

export default defineLink(
  SubscriptionModule.linkable.subscription,
  OrderModule.linkable.order
)
