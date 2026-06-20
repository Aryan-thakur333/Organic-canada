import OrderModule from "@medusajs/medusa/order"
import B2BModule from "../modules/b2b"
import { defineLink } from "@medusajs/framework/utils"

export default defineLink(
  OrderModule.linkable.order,
  B2BModule.linkable.company
)
