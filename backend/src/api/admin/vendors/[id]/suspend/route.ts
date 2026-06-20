import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../../../modules/vendor"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params

  try {
    const vendorService: any = req.scope.resolve(VENDOR_MODULE)
    const vendor = await vendorService.retrieveVendor(id)

    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" })
    }

    const updated = await vendorService.updateVendors({
      id,
      status: "suspended"
    })

    return res.json({
      message: "Vendor suspended successfully",
      vendor: updated
    })
  } catch (error: any) {
    console.error("Admin suspend vendor error:", error)
    return res.status(500).json({ message: error.message || "Failed to suspend vendor" })
  }
}
