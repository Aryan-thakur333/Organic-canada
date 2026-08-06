import PosCashPaymentProviderService from "../service"

describe("pp_pos_cash", () => {
  const provider = new PosCashPaymentProviderService({}, {})

  it("uses sufficient tender, captures only the order total, and stores operational change metadata", async () => {
    const initiated = await provider.initiatePayment({
      amount: 12.5,
      currency_code: "CAD",
      context: { idempotency_key: "sale-1" },
      data: { register_id: "reg-1", session_id: "ses-1", operator_id: "op-1", transaction_id: "tx-1", receipt_number: "POS-1", amount_tendered_minor: 2000, change_due_minor: 750 },
    })
    expect(initiated.id).toBe("cash_sale-1")
    expect(initiated.data).toMatchObject({ amount: 12.5, amount_minor: 1250, amount_tendered_minor: 2000, change_due_minor: 750, state: "pending", register_id: "reg-1" })
    const authorized = await provider.authorizePayment({ data: initiated.data })
    expect(authorized.status).toBe("authorized")
    const captured = await provider.capturePayment({ data: authorized.data })
    expect(captured.data).toMatchObject({ amount: 12.5, amount_minor: 1250, tendered_amount: 2000, change_due: 750, state: "captured" })
  })

  it("rejects insufficient tender", async () => {
    await expect(provider.initiatePayment({ amount: 12.5, currency_code: "cad", data: { amount_tendered_minor: 1200 } })).rejects.toThrow("Cash tendered is less")
  })

  it("supports idempotent partial refunds and blocks over-refunds", async () => {
    const initiated = await provider.initiatePayment({ amount: 10, currency_code: "usd", context: { idempotency_key: "refund-1" } })
    const authorized = await provider.authorizePayment({ data: initiated.data })
    const captured = await provider.capturePayment({ data: authorized.data })
    const first = await provider.refundPayment({ amount: 2.5, data: captured.data })
    expect(first.data?.refunded_amount_minor).toBe(250)
    const second = await provider.refundPayment({ amount: 7.5, data: first.data })
    expect(second.data?.refunded_amount_minor).toBe(1000)
    await expect(provider.refundPayment({ amount: 0.01, data: second.data })).rejects.toThrow("exceeds")
  })

  it("does not apply the same provider refund idempotency key twice", async () => {
    const initiated = await provider.initiatePayment({ amount: 5, currency_code: "usd" })
    const authorized = await provider.authorizePayment({ data: initiated.data })
    const captured = await provider.capturePayment({ data: authorized.data })
    const once = await provider.refundPayment({ amount: 1, data: captured.data, context: { idempotency_key: "refund-op-1" } })
    const replay = await provider.refundPayment({ amount: 1, data: once.data, context: { idempotency_key: "refund-op-1" } })
    expect(replay.data?.refunded_amount_minor).toBe(100)
  })

  it("supports retrieve, pending update, cancel, status, and delete semantics", async () => {
    const initiated = await provider.initiatePayment({ amount: 5, currency_code: "cad", context: { idempotency_key: "manage-1" }, data: { amount_tendered_minor: 700 } })
    const retrieved = await provider.retrievePayment({ data: initiated.data })
    expect(retrieved.data?.cash_payment_id).toBe("cash_manage-1")
    const updated = await provider.updatePayment({ amount: 6, currency_code: "cad", data: { ...initiated.data, amount_tendered_minor: 800 } })
    expect(updated.data).toMatchObject({ amount: 6, amount_minor: 600, amount_tendered_minor: 800, change_due_minor: 200 })
    const canceled = await provider.cancelPayment({ data: updated.data })
    expect((await provider.getPaymentStatus({ data: canceled.data })).status).toBe("canceled")
    const deleted = await provider.deletePayment({ data: canceled.data })
    expect(deleted.data?.state).toBe("deleted")
  })

  it("does not allow deleting or canceling captured cash before refund", async () => {
    const initiated = await provider.initiatePayment({ amount: 1, currency_code: "usd" })
    const authorized = await provider.authorizePayment({ data: initiated.data })
    const captured = await provider.capturePayment({ data: authorized.data })
    await expect(provider.deletePayment({ data: captured.data })).rejects.toThrow("cannot be deleted")
    await expect(provider.cancelPayment({ data: captured.data })).rejects.toThrow("must be refunded")
  })
})
