// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../../modules/vendor"
import { comparePassword, hashPassword, signToken } from "../auth"

function toSafeVendor(vendor: any) {
  const { password_hash: _, ...safeVendor } = vendor
  return {
    ...safeVendor,
    business_name: vendor.store_name,
  }
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { email, password } = req.body as any
  const normalizedEmail = String(email || "").trim().toLowerCase()

  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || !password) {
    return res.status(400).json({ message: "Email and password are required" })
  }

  try {
    const logger = req.scope.resolve("logger") as any
    const vendorService: any = req.scope.resolve(VENDOR_MODULE)
    const [vendor] = await vendorService.listVendors({ email: normalizedEmail })
    let passwordMatches = false

    if (!vendor) {
      logger.info(`[Vendor Login Debug] ${JSON.stringify({
        emailNormalized: normalizedEmail,
        vendorFound: false,
        authCredentialFound: false,
        accountStatus: null,
        result: "vendor_not_found"
      })}`)
      return res.status(401).json({ message: "Invalid email or password" })
    }

    if (!vendor.password_hash) {
      logger.info(`[Vendor Login Debug] ${JSON.stringify({
        emailNormalized: normalizedEmail,
        vendorFound: true,
        authCredentialFound: false,
        accountStatus: vendor.status,
        result: "password_hash_missing"
      })}`)
      return res.status(401).json({ message: "Invalid email or password" })
    }

    passwordMatches = comparePassword(password, vendor.password_hash)
    if (!passwordMatches) {
      logger.info(`[Vendor Login Debug] ${JSON.stringify({
        emailNormalized: normalizedEmail,
        vendorFound: true,
        authCredentialFound: true,
        accountStatus: vendor.status,
        result: "password_mismatch"
      })}`)
      return res.status(401).json({ message: "Invalid email or password" })
    }

    if (!vendor.password_hash.startsWith("$2")) {
      await vendorService.updateVendors({
        id: vendor.id,
        password_hash: hashPassword(password),
      })
    }

    if (vendor.status === "pending") {
      logger.info(`[Vendor Login Debug] ${JSON.stringify({
        emailNormalized: normalizedEmail,
        vendorFound: true,
        authCredentialFound: true,
        accountStatus: vendor.status,
        result: "vendor_pending"
      })}`)
      return res.status(403).json({ 
        message: "Vendor account pending admin approval.",
        status: "pending" 
      })
    }

    if (vendor.status === "rejected") {
      logger.info(`[Vendor Login Debug] ${JSON.stringify({
        emailNormalized: normalizedEmail,
        vendorFound: true,
        authCredentialFound: true,
        accountStatus: vendor.status,
        result: "vendor_rejected"
      })}`)
      return res.status(403).json({ 
        message: "Your vendor application was rejected. Please contact support.",
        status: "rejected" 
      })
    }

    if (vendor.status === "suspended") {
      logger.info(`[Vendor Login Debug] ${JSON.stringify({
        emailNormalized: normalizedEmail,
        vendorFound: true,
        authCredentialFound: true,
        accountStatus: vendor.status,
        result: "vendor_suspended"
      })}`)
      return res.status(403).json({ 
        message: "Your vendor account has been suspended. Please contact support.",
        status: "suspended" 
      })
    }

    // Generate JWT
    const token = signToken(vendor.id)
    logger.info(`[Vendor Login Debug] ${JSON.stringify({
      emailNormalized: normalizedEmail,
      vendorFound: true,
      authCredentialFound: true,
      accountStatus: vendor.status,
      result: "login_success"
    })}`)

    return res.json({
      message: "Login successful",
      token,
      vendor: toSafeVendor(vendor),
    })
  } catch (error: any) {
    const logger = req.scope.resolve("logger") as any
    logger.error("Vendor login error: " + error.message)
    logger.info(`[Vendor Login Debug] ${JSON.stringify({
      emailNormalized: normalizedEmail,
      vendorFound: false,
      authCredentialFound: false,
      accountStatus: null,
      result: "error: " + error.message
    })}`)
    return res.status(500).json({ message: error.message || "Failed to log in vendor" })
  }
}
