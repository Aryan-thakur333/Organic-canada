import { MedusaService } from "@medusajs/framework/utils"
import { VendorOrder } from "./models/vendor-order"
import { VendorOrderItem } from "./models/vendor-order-item"
import { VendorOrderActivity } from "./models/vendor-order-activity"
import { VendorEarning } from "./models/vendor-earning"

export default class MarketplaceService extends MedusaService({
  VendorOrder,
  VendorOrderItem,
  VendorOrderActivity,
  VendorEarning,
}) {
  
}
