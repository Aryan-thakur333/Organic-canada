import { model } from "@medusajs/framework/utils"
export const PricingApplyAction = model.define("pricingApplyAction", {
  id:model.id({prefix:"paa"}).primaryKey(), batch_id:model.text(), variant_id:model.text(), product_title:model.text(), variant_title:model.text(), currency_code:model.text(), action_type:model.text(), before_value:model.text().nullable(), after_value:model.text().nullable(), status:model.text(), error_message:model.text().nullable(),
})
