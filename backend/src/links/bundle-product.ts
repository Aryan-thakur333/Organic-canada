import { defineLink } from "@medusajs/framework/utils"
import BundleModule from "../modules/bundle"
import ProductModule from "@medusajs/medusa/product"

export default defineLink(
  ProductModule.linkable.product,
  { linkable: BundleModule.linkable.bundleItem, isList: true, deleteCascade: true }
)
