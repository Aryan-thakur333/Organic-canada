import { model } from "@medusajs/framework/utils"
export const PosOperatorAssignment = model.define("pos_operator_assignment", { id: model.id().primaryKey(), register_id: model.text(), operator_id: model.text(), role: model.text().default("POS_OPERATOR"), active: model.boolean().default(true), metadata: model.json().nullable() })
