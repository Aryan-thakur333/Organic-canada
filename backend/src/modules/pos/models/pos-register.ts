import { model } from "@medusajs/framework/utils"
export const PosRegister = model.define("pos_register", { id: model.id().primaryKey(), name: model.text(), code: model.text(), sales_channel_id: model.text(), stock_location_id: model.text(), region_id: model.text(), currency_code: model.text(), status: model.text().default("ACTIVE"), metadata: model.json().nullable() })
