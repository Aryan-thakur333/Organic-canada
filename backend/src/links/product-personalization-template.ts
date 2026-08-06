import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import PersonalizationModule from "../modules/personalization"

/** Product-level templates may apply to every variant unless variant_id is set. */
export default defineLink(
  ProductModule.linkable.product,
  { linkable: PersonalizationModule.linkable.personalizationTemplate, isList: true, deleteCascade: true }
)
