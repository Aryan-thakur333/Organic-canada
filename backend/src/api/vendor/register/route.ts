// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../modules/vendor"
import { hashPassword } from "../auth"

function toSafeVendor(vendor: any) {
  const { password_hash: _, ...safeVendor } = vendor
  return {
    ...safeVendor,
    business_name: vendor.store_name,
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const {
    business_name,
    owner_name,
    name,
    store_name,
    email,
    password,
    confirm_password,
    phone,
    description,
    company_details,
  } = req.body as any

  const normalizedEmail = String(email || "").trim().toLowerCase()
  const normalizedStoreName = String(business_name || store_name || "").trim()
  const normalizedOwnerName = String(owner_name || name || "").trim()
  const normalizedPhone = phone ? String(phone).trim() : null

  if (!normalizedStoreName) {
    return res.status(400).json({ message: "Business name is required" })
  }

  if (!normalizedOwnerName) {
    return res.status(400).json({ message: "Owner name is required" })
  }

  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
    return res.status(400).json({ message: "A valid email is required" })
  }

  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({
      message: "Password must be at least 8 characters long",
    })
  }

  if (confirm_password !== undefined && password !== confirm_password) {
    return res.status(400).json({ message: "Passwords do not match" })
  }

  try {
    const vendorService: any = req.scope.resolve(VENDOR_MODULE)
    
    // Check if email already exists
    const [existing] = await vendorService.listVendors({ email: normalizedEmail })
    if (existing) {
      return res.status(400).json({ message: "Email already registered" })
    }

    const password_hash = hashPassword(password)
    const vendor = await vendorService.createVendors({
      name: normalizedOwnerName,
      store_name: normalizedStoreName,
      email: normalizedEmail,
      phone: normalizedPhone,
      description: description || null,
      company_details: company_details || null,
      password_hash,
      status: "pending",
    })

    return res.status(201).json({
      status: vendor.status,
      message: "Vendor registration submitted. Awaiting administrator approval.",
      vendor: toSafeVendor(vendor),
    })
  } catch (error: any) {
    console.error("Vendor registration error:", error)
    return res.status(500).json({ message: error.message || "Failed to register vendor" })
  }
}
