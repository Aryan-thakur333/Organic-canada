import VendorModule from "../modules/vendor/index"
import ProductModule from "@medusajs/medusa/product"
import { defineLink } from "@medusajs/framework/utils"

export default defineLink(
  ProductModule.linkable.product,
  VendorModule.linkable.vendor
)
