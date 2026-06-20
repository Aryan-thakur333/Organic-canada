// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../modules/vendor"
import { hashPassword, signToken } from "../auth"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { name, store_name, email, password, description, company_details } = req.body as any

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" })
  }

  try {
    const vendorService: any = req.scope.resolve(VENDOR_MODULE)
    
    // Check if email already exists
    const [existing] = await vendorService.listVendors({ email })
    if (existing) {
      return res.status(400).json({ message: "Email already registered" })
    }

    const password_hash = hashPassword(password)
    const vendor = await vendorService.createVendors({
      name: name || store_name || "",
      store_name: store_name || name || "",
      email,
      description: description || null,
      company_details: company_details || null,
      password_hash,
      status: "pending",
    })

    const token = signToken(vendor.id)

    const { password_hash: _, ...safeVendor } = vendor
    return res.status(201).json({
      message: "Vendor registration submitted. Awaiting administrator approval.",
      vendor: safeVendor,
      token,
    })
  } catch (error: any) {
    console.error("Vendor registration error:", error)
    return res.status(500).json({ message: error.message || "Failed to register vendor" })
  }
}
