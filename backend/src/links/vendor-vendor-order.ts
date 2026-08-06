import MarketplaceModule from "../modules/marketplace/index"
import VendorModule from "../modules/vendor/index"
import { defineLink } from "@medusajs/framework/utils"

export default defineLink(
  VendorModule.linkable.vendor,
  {
    linkable: MarketplaceModule.linkable.vendorOrder,
    isList: true
  }
)
