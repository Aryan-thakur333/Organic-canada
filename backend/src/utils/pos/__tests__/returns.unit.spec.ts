import type { PosService } from "../contracts"
import { previewReturn } from "../returns"

const serviceWithReturns = (returns: Array<Record<string, unknown>> = []) => ({
  listPosReturns: jest.fn().mockResolvedValue(returns),
}) as unknown as PosService

describe("POS native total return allocation", () => {
  const order = {
    id: "order-1",
    items: [{
      id: "item-1", quantity: 3, unit_price: 10,
      subtotal: 30, discount_total: 3, tax_total: 3.51, total: 30.51,
    }],
  }
  const transaction = { total_minor: 3051, currency_code: "cad" }

  it("reverses proportional promotion and tax amounts for a partial return", async () => {
    const preview = await previewReturn(serviceWithReturns(), transaction, order, [{ item_id: "item-1", quantity: 1 }])
    expect(preview.items[0]).toMatchObject({ subtotal_minor: 1000, discount_minor: 100, tax_minor: 117, refund_total_minor: 1017 })
    expect(preview.refund_amount_minor).toBe(1017)
  })

  it("uses cumulative rounding so sequential partial returns equal the native line total", async () => {
    const prior = [{ original_order_id: "order-1", refund_amount_minor: 1017, items: [{ id: "item-1", quantity: 1 }] }]
    const second = await previewReturn(serviceWithReturns(prior), transaction, order, [{ item_id: "item-1", quantity: 2 }])
    expect(second.refund_amount_minor).toBe(2034)
    expect(1017 + second.refund_amount_minor).toBe(3051)
  })
})
