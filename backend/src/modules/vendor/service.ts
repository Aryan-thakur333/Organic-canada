import { MedusaService } from "@medusajs/framework/utils"
import { Vendor } from "./models/vendor"

class VendorService extends MedusaService({
  Vendor,
}) {}

export default VendorService
