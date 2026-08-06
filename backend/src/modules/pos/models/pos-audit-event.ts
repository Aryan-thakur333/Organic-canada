import { model } from "@medusajs/framework/utils"
export const PosAuditEvent = model.define("pos_audit_event", { id: model.id().primaryKey(), register_id: model.text().nullable(), session_id: model.text().nullable(), transaction_id: model.text().nullable(), operator_id: model.text().nullable(), event_type: model.text(), message: model.text(), metadata: model.json().nullable() })
