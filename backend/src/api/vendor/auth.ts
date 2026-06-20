import crypto from "crypto"
import jwt from "jsonwebtoken"
import type { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http"
import { VENDOR_MODULE } from "../../modules/vendor"

const JWT_SECRET = process.env.JWT_SECRET || "supersecret"

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex")
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex")
  return `${salt}:${hash}`
}

export function comparePassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":")
    const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex")
    return hash === verifyHash
  } catch (err) {
    return false
  }
}

export function signToken(vendorId: string): string {
  return jwt.sign({ vendorId }, JWT_SECRET, { expiresIn: "7d" })
}

export function verifyToken(token: string): { vendorId: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { vendorId: string }
  } catch (err) {
    return null
  }
}

export async function authenticateVendor(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const urlPath = req.originalUrl || req.url || req.path || ""
  if (urlPath.includes("/login") || urlPath.includes("/register")) {
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
