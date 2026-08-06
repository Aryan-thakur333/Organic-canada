import MarketplaceModule from "../modules/marketplace/index"
import OrderModule from "@medusajs/medusa/order"
import { defineLink } from "@medusajs/framework/utils"

export default defineLink(
  OrderModule.linkable.order,
  {
    linkable: MarketplaceModule.linkable.vendorOrder,
    isList: true
  }
)
