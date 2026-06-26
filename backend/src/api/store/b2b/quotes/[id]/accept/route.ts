import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createCartWorkflow } from "@medusajs/medusa/core-flows"
import { B2B_MODULE } from "../../../../../../modules/b2b"
import { Modules } from "@medusajs/framework/utils"

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const customerId = (req as any).auth_context?.actor_id
  const service: any = req.scope.resolve(B2B_MODULE)
  const quote = await service.retrieveQuote(req.params.id)
  if (!quote || quote.customer_id !== customerId) return res.status(404).json({ message: "Quote not found" })
  if (quote.status !== "approved") return res.status(409).json({ message: "Only approved quotes can be accepted" })
  if (quote.expires_at && new Date(quote.expires_at) <= new Date()) {
    await service.updateQuotes({ id: quote.id, status: "expired" })
    return res.status(410).json({ message: "Quote has expired" })
  }
  if (quote.cart_id) return res.json({ quote, cart_id: quote.cart_id, reused: true })
  const items = quote.items || []
  if (items.some((item: any) => !item.variant_id)) return res.status(422).json({ message: "All accepted quote items must reference a product variant" })
  const effectiveTotal = quote.negotiated_total ?? quote.total ?? quote.subtotal
  const ratio = quote.subtotal > 0 ? effectiveTotal / quote.subtotal : 1
  let regionId = (req.body as any).region_id
  if (!regionId) regionId = (await (req.scope.resolve(Modules.REGION) as any).listRegions({}, { take: 1 }))?.[0]?.id
  if (!regionId) return res.status(422).json({ message: "No checkout region is configured" })
  const { result: cart } = await createCartWorkflow(req.scope).run({ input: {
    region_id: regionId,
    sales_channel_id: (req.body as any).sales_channel_id,
    customer_id: customerId,
    email: quote.customer_email,
    currency_code: quote.currency_code || "cad",
    metadata: { quote_id: quote.id, company_id: quote.company_id, is_wholesale: true },
    items: items.map((item: any) => ({ variant_id: item.variant_id, quantity: item.quantity, unit_price: Math.round(item.unit_price * ratio), metadata: { quote_id: quote.id, quoted_unit_price: item.unit_price } })),
  } as any })
  const updated = await service.updateQuotes({ id: quote.id, status: "converted_to_order", cart_id: cart.id, metadata: { ...(quote.metadata || {}), accepted_at: new Date().toISOString() } })
  return res.status(201).json({ quote: updated, cart_id: cart.id, cart })
}
