// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../modules/vendor"
import { comparePassword, hashPassword, signToken } from "../auth"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { email, password } = req.body as any
  const normalizedEmail = String(email || "").trim().toLowerCase()

  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || !password) {
    return res.status(400).json({ message: "Email and password are required" })
  }

  try {
    const vendorService: any = req.scope.resolve(VENDOR_MODULE)
    const [vendor] = await vendorService.listVendors({ email: normalizedEmail })

    if (!vendor) {
      return res.status(401).json({ message: "Invalid email or password" })
    }

    const isValidPassword = comparePassword(password, vendor.password_hash)
    if (!isValidPassword) {
      return res.status(401).json({ message: "Invalid email or password" })
    }

    if (!vendor.password_hash.startsWith("$2")) {
      await vendorService.updateVendors({
        id: vendor.id,
        password_hash: hashPassword(password),
      })
    }

    if (vendor.status === "pending") {
      return res.status(403).json({ 
        message: "Waiting for admin approval",
        status: "pending" 
      })
    }

    if (vendor.status === "rejected") {
      return res.status(403).json({ 
        message: "Your vendor application was rejected. Please contact support.",
        status: "rejected" 
      })
    }

    if (vendor.status === "suspended") {
      return res.status(403).json({ 
        message: "Your vendor account has been suspended. Please contact support.",
        status: "suspended" 
      })
    }

    // Generate JWT
    const token = signToken(vendor.id)
    const { password_hash: _, ...safeVendor } = vendor

    return res.json({
      message: "Login successful",
      token,
      vendor: safeVendor,
    })
  } catch (error: any) {
    console.error("Vendor login error:", error)
    return res.status(500).json({ message: error.message || "Failed to log in vendor" })
  }
}
