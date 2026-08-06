import { PosError, integerMinor } from "./contracts"
export type PaymentInput = { method: "CASH" | "CARD_MANUAL" | "STRIPE_TERMINAL" | "GIFT_CARD" | "STORE_CREDIT"; amount_minor: number; amount_tendered_minor?: number; terminal_reference?: string; authorization_reference?: string; last_four?: string }
export function validatePayments(totalMinor: number, payments: PaymentInput[]) {
  integerMinor(totalMinor, "total_minor")
  if (!payments.length) throw new PosError("POS_PAYMENT_FAILED", "At least one payment is required", 422)
  let applied = 0
  return payments.map((payment) => {
    const amount = integerMinor(payment.amount_minor, "amount_minor", false)
    if (payment.method === "STRIPE_TERMINAL") throw new PosError("POS_PAYMENT_FAILED", "Stripe Terminal is not configured", 422)
    if (payment.method === "CARD_MANUAL" && (!payment.terminal_reference || !payment.authorization_reference)) throw new PosError("POS_PAYMENT_FAILED", "Manual card payment requires terminal and authorization references", 422)
    let changeDue = 0
    if (payment.method === "CASH") {
      const tendered = integerMinor(payment.amount_tendered_minor ?? amount, "amount_tendered_minor")
      if (tendered < amount) throw new PosError("POS_PAYMENT_FAILED", "Cash tendered is insufficient", 422)
      changeDue = tendered - amount
    }
    applied += amount
    return { ...payment, amount_minor: amount, change_due_minor: changeDue }
  }).map((payment, _index, all) => {
    if (applied !== totalMinor) throw new PosError("POS_PAYMENT_FAILED", "Combined payment amount must equal the order total", 422)
    return payment
  })
}
