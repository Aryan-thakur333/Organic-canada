import B2BModule from "../modules/b2b"
import CustomerModule from "@medusajs/medusa/customer"
import { defineLink } from "@medusajs/framework/utils"

export default defineLink(
  B2BModule.linkable.company,
  CustomerModule.linkable.customer
)
