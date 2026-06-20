import OrderModule from "@medusajs/medusa/order"
import VendorModule from "../modules/vendor"
import { defineLink } from "@medusajs/framework/utils"

export default defineLink(
  OrderModule.linkable.order,
  VendorModule.linkable.vendor
)
