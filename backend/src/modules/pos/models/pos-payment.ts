import { model } from "@medusajs/framework/utils"
export const PosPayment = model.define("pos_payment", { id: model.id().primaryKey(), transaction_id: model.text(), provider: model.text(), method: model.text(), amount_minor: model.number(), currency_code: model.text(), reference: model.text().nullable(), status: model.text().default("PENDING"), metadata: model.json().nullable() })
