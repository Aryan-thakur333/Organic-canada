import { defineLink } from "@medusajs/framework/utils"
import CartModule from "@medusajs/medusa/cart"
import PersonalizationModule from "../modules/personalization"

export default defineLink(
  CartModule.linkable.lineItem,
  { linkable: PersonalizationModule.linkable.cartItemPersonalization, deleteCascade: true }
)
