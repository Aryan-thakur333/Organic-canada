import StockLocationModule from "@medusajs/medusa/stock-location"
import VendorModule from "../modules/vendor/index"
import { defineLink } from "@medusajs/framework/utils"

export default defineLink(
  VendorModule.linkable.vendor,
  {
    linkable: StockLocationModule.linkable.stockLocation,
    isList: true
  }
)
