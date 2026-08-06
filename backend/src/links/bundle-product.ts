import { defineLink } from "@medusajs/framework/utils"
import BundleModule from "../modules/bundle/index"
import ProductModule from "@medusajs/medusa/product"

export default defineLink(
  ProductModule.linkable.product,
  { linkable: BundleModule.linkable.bundleDefinition, deleteCascade: true }
)
