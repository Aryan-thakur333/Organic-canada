import { model } from "@medusajs/framework/utils"
export const PosReceipt = model.define("pos_receipt", { id: model.id().primaryKey(), transaction_id: model.text(), receipt_number: model.text(), order_id: model.text(), customer_id: model.text().nullable(), receipt_payload: model.json(), printed_at: model.dateTime().nullable(), emailed_at: model.dateTime().nullable() })
