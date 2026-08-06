import { PosError, integerMinor, type PosService } from "./contracts"
import { nativeAmountToMinor } from "./money"

type ReturnLine = { id: string; quantity: number; unit_price: number; subtotal_minor: number; discount_minor: number; tax_minor: number; refund_total_minor: number }
const numeric = (value: unknown, raw: unknown) => Number(value ?? (raw as { value?: string } | null)?.value ?? 0)

export async function previewReturn(service: PosService, transaction: Record<string, unknown>, order: Record<string, unknown>, requested: Array<{ item_id?: string; quantity?: number }>) {
  const currencyCode = String(transaction.currency_code || order.currency_code || "")
  if (!currencyCode) throw new PosError("POS_CURRENCY_MISMATCH", "Return currency is missing", 422)
  const lines = Array.isArray(order.items) ? order.items as Array<Record<string, unknown>> : []
  const prior = await service.listPosReturns({ original_order_id: order.id }) as Array<Record<string, unknown>>
  const returned = new Map<string, number>()
  for (const entry of prior) for (const item of (Array.isArray(entry.items) ? entry.items : []) as Array<Record<string, unknown>>) returned.set(String(item.id), Number(returned.get(String(item.id)) || 0) + Number(item.quantity || 0))
  const items: ReturnLine[] = requested.map((input) => {
    const line = lines.find((entry) => entry.id === input.item_id)
    if (!line) throw new PosError("POS_INVALID_RETURN", "Order item not found", 422)
    const quantity = integerMinor(input.quantity, "quantity", false)
    const detail = line.detail as Record<string, unknown> | undefined
    const purchased = numeric(line.quantity, line.raw_quantity) || numeric(detail?.quantity, detail?.raw_quantity)
    const remaining = purchased - Number(returned.get(String(line.id)) || 0)
    if (quantity > remaining) throw new PosError("POS_INVALID_RETURN", `Only ${remaining} units remain returnable`, 422)
    const alreadyReturned = Number(returned.get(String(line.id)) || 0)
    const allocate = (field: string, rawField: string, units: number) => Math.round(nativeAmountToMinor(numeric(line[field], line[rawField]), currencyCode, `return ${field}`) * units / purchased)
    const allocatedDelta = (field: string, rawField: string) => allocate(field, rawField, alreadyReturned + quantity) - allocate(field, rawField, alreadyReturned)
    return {
      id: String(line.id), quantity, unit_price: nativeAmountToMinor(numeric(line.unit_price, line.raw_unit_price), currencyCode, "return unit price"),
      subtotal_minor: allocatedDelta("subtotal", "raw_subtotal"),
      discount_minor: allocatedDelta("discount_total", "raw_discount_total"),
      tax_minor: allocatedDelta("tax_total", "raw_tax_total"),
      refund_total_minor: allocatedDelta("total", "raw_total"),
    }
  })
  const refund = items.reduce((sum, item) => sum + item.refund_total_minor, 0)
  const paid = Number(transaction.total_minor || 0)
  const priorRefunds = prior.reduce((sum, item) => sum + Number(item.refund_amount_minor || 0), 0)
  if (refund + priorRefunds > paid) throw new PosError("POS_INVALID_RETURN", "Refund exceeds captured amount", 422)
  return { items, refund_amount_minor: refund, remaining_refundable_minor: paid - priorRefunds - refund }
}
