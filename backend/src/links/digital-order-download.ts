import { defineLink } from "@medusajs/framework/utils"
import DigitalAssetModule from "../modules/digital-asset"
import OrderModule from "@medusajs/medusa/order"

export default defineLink(
  OrderModule.linkable.order,
  { linkable: DigitalAssetModule.linkable.digitalOrderDownload, isList: true, deleteCascade: true }
)
