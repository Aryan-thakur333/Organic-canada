import { defineLink } from "@medusajs/framework/utils"
import OrderModule from "@medusajs/medusa/order"
import PersonalizationModule from "../modules/personalization"

export default defineLink(
  OrderModule.linkable.orderLineItem,
  { linkable: PersonalizationModule.linkable.orderItemPersonalization, deleteCascade: true }
)
