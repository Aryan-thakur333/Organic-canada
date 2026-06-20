import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

const DEFAULT_PROMOTIONS = [
  {
    code: "WELCOME10",
    label: "Welcome — 10% Off",
    description: "Get 10% off your first order",
    type: "percentage",
    value: 10,
    min_cart_value: 0,
  },
  {
    code: "ORGANIC20",
    label: "Organic — 20% Off",
    description: "20% off all organic products",
    type: "percentage",
    value: 20,
    min_cart_value: 300,
  },
  {
    code: "FREESHIP",
    label: "Free Shipping",
    description: "Free shipping on any order",
    type: "fixed",
    value: 0,
    min_cart_value: 100,
  },
  {
    code: "SAVE50",
    label: "Save ₹50",
    description: "Flat ₹50 off on orders above ₹500",
    type: "fixed",
    value: 50,
    min_cart_value: 500,
  },
]

// GET /store/promotions — list all active promotions
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const promotionService: any = req.scope.resolve(Modules.PROMOTION)
    let promos = await promotionService.listPromotions(
      { status: "active" },
      { relations: ["application_method"], order: { created_at: "ASC" } }
    )

    if (promos.length === 0) {
      console.log("[Store Promotions] Database empty. Auto-seeding default promotions...");
      const existing = await promotionService.listPromotions({})
      const existingCodes = new Set(existing.map((p: any) => p.code))

      for (const promo of DEFAULT_PROMOTIONS) {
        if (!existingCodes.has(promo.code)) {
          const isFixed = promo.type === "fixed"
          await promotionService.createPromotions({
            code: promo.code,
            type: "standard",
            status: "active",
            application_method: {
              type: isFixed ? "fixed" : "percentage",
              target_type: "order",
              allocation: "across",
              value: promo.value,
              ...(isFixed ? { currency_code: "inr" } : {}),
            },
          } as any)
        }
      }
      promos = await promotionService.listPromotions(
        { status: "active" },
        { relations: ["application_method"], order: { created_at: "ASC" } }
      )
    }

    // Enrich with our static metadata labels
    const enriched = promos.map((p: any) => {
      const meta = DEFAULT_PROMOTIONS.find((d) => d.code === p.code) || {}
      return {
        id: p.id,
        code: p.code,
        label: (meta as any).label || p.code,
        description: (meta as any).description || "",
        type: p.application_method?.type || "percentage",
        value: p.application_method?.value || 0,
        min_cart_value: (meta as any).min_cart_value || 0,
        used: p.used || 0,
        limit: p.limit || null,
        status: p.status,
      }
    })

    return res.json({ promotions: enriched })
  } catch (error: any) {
    console.error("List promotions error:", error)
    return res.status(500).json({ message: error.message || "Failed to list promotions" })
  }
}

// POST /store/promotions/seed — seed default promotions if missing
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  try {
    const promotionService: any = req.scope.resolve(Modules.PROMOTION)

    const existing = await promotionService.listPromotions({})
    const existingCodes = new Set(existing.map((p: any) => p.code))

    const created = []
    for (const promo of DEFAULT_PROMOTIONS) {
      if (!existingCodes.has(promo.code)) {
        // FREESHIP and SAVE50 use fixed application; WELCOME10/ORGANIC20 use percentage
        const isFixed = promo.type === "fixed"
        const created_promo = await promotionService.createPromotions({
          code: promo.code,
          type: "standard",
          status: "active",
          application_method: {
            type: isFixed ? "fixed" : "percentage",
            target_type: "order",
            allocation: "across",
            value: promo.value,
            ...(isFixed ? { currency_code: "inr" } : {}),
          },
        } as any)
        if (created_promo && created_promo.code) {
          created.push(created_promo.code as never)
        }
      }
    }

    return res.json({
      message: `Seeded ${created.length} new promotions`,
      created,
      existing: existing.map((p: any) => p.code),
    })
  } catch (error: any) {
    console.error("Seed promotions error:", error)
    return res.status(500).json({ message: error.message || "Failed to seed promotions" })
  }
}
