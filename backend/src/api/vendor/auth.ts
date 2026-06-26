import crypto from "crypto"
import jwt from "jsonwebtoken"
import bcrypt from "bcryptjs"
import type { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../modules/vendor"

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    const errMsg = "JWT_SECRET is not set. Add JWT_SECRET to your .env file (minimum 32 characters)."
    console.error(`[Vendor Auth] ${errMsg}`)
    throw new Error(errMsg)
  }
  if (secret.length < 32) {
    const errMsg = `JWT_SECRET must contain at least 32 characters (current length: ${secret.length}). ` +
      `Generate a secure secret with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
    console.error(`[Vendor Auth] ${errMsg}`)
    throw new Error(errMsg)
  }
  return secret
}

const getCookieSecret = (): string => {
  const secret = process.env.COOKIE_SECRET
  if (!secret) {
    const errMsg = "COOKIE_SECRET is not set. Add COOKIE_SECRET to your .env file (minimum 32 characters)."
    console.error(`[Vendor Auth] ${errMsg}`)
    throw new Error(errMsg)
  }
  if (secret.length < 32) {
    const errMsg = `COOKIE_SECRET must contain at least 32 characters (current length: ${secret.length}). ` +
      `Generate a secure secret with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
    console.error(`[Vendor Auth] ${errMsg}`)
    throw new Error(errMsg)
  }
  return secret
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 12)
}

export function comparePassword(password: string, stored: string): boolean {
  try {
    if (stored.startsWith("$2")) return bcrypt.compareSync(password, stored)
    // Backward-compatible verification for recovered accounts. Successful
    // logins are upgraded to bcrypt by the login route.
    const [salt, hash] = stored.split(":")
    if (!salt || !hash) return false
    const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512")
    const storedHash = Buffer.from(hash, "hex")
    return storedHash.length === verifyHash.length && crypto.timingSafeEqual(storedHash, verifyHash)
  } catch (err) {
    return false
  }
}

export function signToken(vendorId: string): string {
  return jwt.sign({ vendorId }, getJwtSecret(), {
    expiresIn: "8h",
    issuer: "organic-canada",
    audience: "vendor-dashboard",
  })
}

export function verifyToken(token: string): { vendorId: string } | null {
  try {
    return jwt.verify(token, getJwtSecret(), {
      issuer: "organic-canada",
      audience: "vendor-dashboard",
    }) as { vendorId: string }
  } catch (err) {
    return null
  }
}

export async function authenticateVendor(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  // Validate COOKIE_SECRET on every authenticated request to ensure
  // Medusa's cookie-based session signing has a secure key. This runs
  // lazily so it won't block server startup if .env hasn't been loaded.
  getCookieSecret()

  const urlPath = req.originalUrl || req.url || req.path || ""
  if (["/vendor/login", "/vendor/register", "/vendor/account-type"].some((path) => urlPath.startsWith(path))) {
    return next()
  }

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authorization token required" })
  }

  const token = authHeader.split(" ")[1]
  const decoded = verifyToken(token)

  if (!decoded || !decoded.vendorId) {
    return res.status(401).json({ message: "Invalid or expired token" })
  }

  try {
    const vendorService: any = req.scope.resolve(VENDOR_MODULE)
    const vendor = await vendorService.retrieveVendor(decoded.vendorId)

    if (!vendor) {
      return res.status(401).json({ message: "Vendor profile not found" })
    }

    if (vendor.status !== "approved") {
      return res.status(403).json({ message: `Vendor account is ${vendor.status}` })
    }

    // Attach vendor object to request
    ;(req as any).vendor = vendor
    next()
  } catch (error) {
    console.error("Vendor auth middleware error:", error)
    return res.status(500).json({ message: "Internal server error during authentication" })
  }
}
