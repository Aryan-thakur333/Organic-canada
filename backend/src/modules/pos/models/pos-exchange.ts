import { model } from "@medusajs/framework/utils"
export const PosExchange = model.define("pos_exchange", { id: model.id().primaryKey(), return_id: model.text(), original_order_id: model.text(), new_transaction_id: model.text().nullable(), outcome: model.text(), difference_minor: model.number(), status: model.text().default("COMPLETED"), metadata: model.json().nullable() })
