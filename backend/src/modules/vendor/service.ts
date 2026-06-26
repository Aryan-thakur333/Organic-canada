import { MedusaService } from "@medusajs/framework/utils"
import { Vendor } from "./models/vendor"
import { PayoutRequest } from "./models/payout-request"
import { InventoryAudit } from "./models/inventory-audit"

class VendorService extends MedusaService({
  Vendor,
  PayoutRequest,
  InventoryAudit,
}) {}

export default VendorService
