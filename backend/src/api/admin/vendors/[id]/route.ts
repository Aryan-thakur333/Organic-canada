import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../../modules/vendor"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params

  try {
    const vendorService: any = req.scope.resolve(VENDOR_MODULE)
    const vendor = await vendorService.retrieveVendor(id, {
      select: ["id", "name", "store_name", "email", "description", "company_details", "status", "created_at", "updated_at"]
    })

    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" })
    }

    return res.json({ vendor })
  } catch (error: any) {
    console.error("Admin retrieve vendor error:", error)
    return res.status(500).json({ message: error.message || "Failed to retrieve vendor" })
  }
}
