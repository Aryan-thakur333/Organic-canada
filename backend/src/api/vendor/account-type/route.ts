import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../modules/vendor"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const email = String((req.body as any)?.email || "").trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ message: "A valid email is required" })
  }

  const vendorService: any = req.scope.resolve(VENDOR_MODULE)
  const [vendor] = await vendorService.listVendors({ email }, { take: 1 })

  return res.json({ account_type: vendor ? "vendor" : "customer" })
}
