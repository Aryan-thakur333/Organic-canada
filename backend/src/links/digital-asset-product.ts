import { defineLink } from "@medusajs/framework/utils"
import DigitalAssetModule from "../modules/digital-asset"
import ProductModule from "@medusajs/medusa/product"

export default defineLink(
  ProductModule.linkable.product,
  { linkable: DigitalAssetModule.linkable.digitalAsset, isList: true, deleteCascade: true }
)
