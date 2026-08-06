import type { ExecArgs } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { capturePaymentWorkflow, createPaymentSessionsWorkflow } from "@medusajs/core-flows"

export default async function verifyPosCashProvider({ container }: ExecArgs) {
  const paymentService = container.resolve(Modules.PAYMENT)
  const amountOf = (entry: { amount?: unknown; raw_amount?: unknown }) => {
    const raw = entry.raw_amount
    return Number(raw && typeof raw === "object" && "value" in raw ? (raw as { value: unknown }).value : raw ?? entry.amount ?? 0)
  }
  const previous = await paymentService.listPaymentCollections({}, { take: 100, relations: ["payments", "payments.captures", "payments.refunds"] })
  for (const priorCollection of previous.filter((entry) => entry.metadata?.source === "pos-production-readiness-verification")) {
    for (const priorPayment of priorCollection.payments || []) {
      const capturedAmount = priorPayment.captures?.reduce((sum, capture) => sum + amountOf(capture), 0) || 0
      const refundedAmount = priorPayment.refunds?.reduce((sum, refund) => sum + amountOf(refund), 0) || 0
      if (capturedAmount > refundedAmount) await paymentService.refundPayment({ payment_id: priorPayment.id, amount: capturedAmount - refundedAmount, created_by: "runtime-verification-cleanup", note: "Refund synthetic POS provider verification balance" })
    }
  }
  const idempotencyKey = `pos-cash-runtime-${Date.now()}`
  const collection = await paymentService.createPaymentCollections({ amount: 10, currency_code: "cad", metadata: { source: "pos-production-readiness-verification", idempotency_key: idempotencyKey } })
  const { result: session } = await createPaymentSessionsWorkflow(container).run({
    input: {
      payment_collection_id: collection.id,
      provider_id: "pp_pos_cash",
      data: {
        register_id: "runtime-verification-register", session_id: "runtime-verification-session",
        operator_id: "runtime-verification-operator", transaction_id: idempotencyKey,
        receipt_number: "POS-RUNTIME-VERIFY", amount_tendered_minor: 1200,
        change_due_minor: 200, idempotency_key: idempotencyKey,
      },
    },
  })
  const authorized = await paymentService.authorizePaymentSession(session.id, {})
  const captured = await capturePaymentWorkflow(container).run({ input: { payment_id: authorized.id, amount: 10, captured_by: "runtime-verification" } })
  await paymentService.refundPayment({ payment_id: authorized.id, amount: 2.5, created_by: "runtime-verification", note: "Partial refund provider verification" })
  const finalPayment = await paymentService.retrievePayment(authorized.id, { relations: ["captures", "refunds"] })
  const result = {
    provider_id: session.provider_id, collection_id: collection.id, session_id: session.id, payment_id: authorized.id,
    initiated_status: session.status, authorized_status: authorized.captured_at ? "captured" : "authorized",
    captured_native_amount: captured.result.captures?.reduce((sum, capture) => sum + amountOf(capture), 0) || 0,
    captured_amount_minor: 1000, tendered_amount_minor: 1200, change_due_minor: 200,
    refunded_native_amount: finalPayment.refunds?.reduce((sum, refund) => sum + amountOf(refund), 0) || 0,
    refunded_amount_minor: 250,
    provider_data: finalPayment.data,
    result: finalPayment.captures?.length === 1 && finalPayment.refunds?.length === 1 ? "PASSED" : "FAILED",
  }
  await paymentService.refundPayment({ payment_id: authorized.id, amount: 7.5, created_by: "runtime-verification-cleanup", note: "Refund remaining synthetic verification balance" })
  console.log("[POS_CASH_PROVIDER_VERIFICATION]")
  console.log(JSON.stringify(result, null, 2))
}
