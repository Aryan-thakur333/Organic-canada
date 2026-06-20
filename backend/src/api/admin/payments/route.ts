import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const query: any = req.scope.resolve("query")

    // Fetch all orders with their payment collections, payments, captures, refunds
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "email",
        "currency_code",
        "total",
        "payment_status",
        "created_at",
        "payment_collections.id",
        "payment_collections.payments.id",
        "payment_collections.payments.amount",
        "payment_collections.payments.provider_id",
        "payment_collections.payments.captures.id",
        "payment_collections.payments.captures.amount",
        "payment_collections.payments.refunds.id",
        "payment_collections.payments.refunds.amount",
      ],
    })

    const paymentsList = orders.flatMap((order: any) => {
      const collections = order.payment_collections || []
      if (collections.length === 0) {
        return [{
          order_id: order.id,
          display_id: order.display_id,
          email: order.email,
          currency: order.currency_code,
          amount: order.total,
          provider: "none",
          payment_id: "none",
          status: "pending",
          created_at: order.created_at,
        }]
      }

      return collections.flatMap((col: any) => {
        const payments = col.payments || []
        if (payments.length === 0) {
          return [{
            order_id: order.id,
            display_id: order.display_id,
            email: order.email,
            currency: order.currency_code,
            amount: order.total,
            provider: "none",
            payment_id: "none",
            status: "pending",
            created_at: order.created_at,
          }]
        }

        return payments.map((pay: any) => {
          let status = "authorized"
          const captures = pay.captures || []
          const refunds = pay.refunds || []

          const totalCaptured = captures.reduce((sum: number, c: any) => sum + (c.amount || 0), 0)
          const totalRefunded = refunds.reduce((sum: number, r: any) => sum + (r.amount || 0), 0)

          if (totalRefunded > 0) {
            status = totalRefunded >= pay.amount ? "refunded" : "partially_refunded"
          } else if (totalCaptured >= pay.amount) {
            status = "captured"
          } else if (order.payment_status === "failed") {
            status = "failed"
          }

          return {
            order_id: order.id,
            display_id: order.display_id,
            email: order.email,
            currency: order.currency_code,
            amount: pay.amount / 100,
            provider: pay.provider_id,
            payment_id: pay.id,
            status,
            created_at: order.created_at,
          }
        })
      })
    })

    // Sort by created_at descending
    paymentsList.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return res.json({ payments: paymentsList })
  } catch (error: any) {
    console.error("[Admin Payments] Error:", error)
    return res.status(500).json({ message: error.message || "Failed to list payments" })
  }
}
