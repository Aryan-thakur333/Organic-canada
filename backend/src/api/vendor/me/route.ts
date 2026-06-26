// @ts-nocheck
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const vendor = (req as any).vendor

  if (!vendor) {
    return res.status(401).json({ message: "Not authenticated" })
  }

  return res.json({
    vendor: {
      id: vendor.id,
      store_name: vendor.store_name,
      name: vendor.name,
      email: vendor.email,
      phone: vendor.phone || null,
      status: vendor.status,
    },
  })
}
