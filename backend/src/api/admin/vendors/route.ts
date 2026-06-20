import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../modules/vendor"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const vendorService: any = req.scope.resolve(VENDOR_MODULE)
    // List all vendors (returning safe fields)
    const vendors = await vendorService.listVendors({}, {
      select: ["id", "name", "store_name", "email", "description", "company_details", "status", "created_at"]
    })
    
    return res.json({ vendors })
  } catch (error: any) {
    console.error("Admin list vendors error:", error)
    return res.status(500).json({ message: error.message || "Failed to list vendors" })
  }
}
