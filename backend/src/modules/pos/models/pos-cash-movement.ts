import { model } from "@medusajs/framework/utils"
export const PosCashMovement = model.define("pos_cash_movement", { id: model.id().primaryKey(), register_session_id: model.text(), operator_id: model.text(), movement_type: model.text(), amount_minor: model.number(), reason: model.text().nullable(), metadata: model.json().nullable() })
