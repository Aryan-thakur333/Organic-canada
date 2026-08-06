import { randomUUID } from "node:crypto"
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
import {
  AbstractPaymentProvider,
  MedusaError,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"

type CashState = "pending" | "authorized" | "captured" | "canceled" | "deleted"

type CashPaymentData = Record<string, unknown> & {
  cash_payment_id: string
  state: CashState
  currency_code: string
  amount: number
  amount_minor: number
  tendered_amount: number
  change_due: number
  refunded_amount: number
  refunded_amount_minor: number
  idempotency_key?: string
  register_id?: string
  session_id?: string
  operator_id?: string
  transaction_id?: string
  receipt_number?: string
  amount_tendered_minor: number
  change_due_minor: number
}

const numeric = (value: unknown, field: string): number => {
  const raw = value && typeof value === "object" && "value" in value ? (value as { value: unknown }).value : value
  const amount = typeof raw === "number" ? raw : Number(String(raw))
  if (!Number.isFinite(amount) || amount < 0) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `${field} must be a non-negative number`)
  }
  return amount
}

const toMinor = (value: unknown, currencyCode: string): number => {
  const amount = numeric(value, "amount")
  const digits = new Intl.NumberFormat("en", { style: "currency", currency: currencyCode.toUpperCase() }).resolvedOptions().maximumFractionDigits ?? 2
  return Math.round((amount + Number.EPSILON) * (10 ** digits))
}

const stateFrom = (data: Record<string, unknown> | undefined): CashPaymentData => {
  if (!data?.cash_payment_id || !data.state) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "POS cash payment data is incomplete")
  }
  return data as CashPaymentData
}

const metadataFrom = (input: { data?: Record<string, unknown>; context?: { idempotency_key?: string } }) => {
  const source = input.data || {}
  return {
    idempotency_key: input.context?.idempotency_key || (source.idempotency_key as string | undefined),
    register_id: source.register_id as string | undefined,
    session_id: source.session_id as string | undefined,
    operator_id: source.operator_id as string | undefined,
    transaction_id: source.transaction_id as string | undefined,
    receipt_number: source.receipt_number as string | undefined,
  }
}

export default class PosCashPaymentProviderService extends AbstractPaymentProvider {
  static identifier = "pos"

  constructor(container: Record<string, unknown>, options: Record<string, unknown> = {}) {
    super(container, options)
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const amount = numeric(input.amount, "amount")
    const amountMinor = toMinor(input.amount, input.currency_code)
    const tenderedAmount = numeric(input.data?.amount_tendered_minor ?? input.data?.tendered_amount ?? amountMinor, "amount_tendered_minor")
    if (tenderedAmount < amountMinor) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Cash tendered is less than the payment amount")
    }
    const idempotencyKey = input.context?.idempotency_key || (input.data?.idempotency_key as string | undefined)
    const id = idempotencyKey ? `cash_${idempotencyKey}` : `cash_${randomUUID()}`
    const data: CashPaymentData = {
      cash_payment_id: id,
      state: "pending",
      currency_code: input.currency_code.toLowerCase(),
      amount,
      amount_minor: amountMinor,
      tendered_amount: tenderedAmount,
      change_due: tenderedAmount - amountMinor,
      amount_tendered_minor: tenderedAmount,
      change_due_minor: tenderedAmount - amountMinor,
      refunded_amount: 0,
      refunded_amount_minor: 0,
      ...metadataFrom(input),
    }
    return { id, status: PaymentSessionStatus.PENDING, data }
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const current = stateFrom(input.data)
    if (current.state === "canceled" || current.state === "deleted") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `Cannot authorize a ${current.state} cash payment`)
    }
    if (current.tendered_amount < current.amount_minor) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Cash tendered is less than the payment amount")
    }
    const data = { ...current, state: current.state === "captured" ? "captured" : "authorized" } as CashPaymentData
    return { status: data.state === "captured" ? PaymentSessionStatus.CAPTURED : PaymentSessionStatus.AUTHORIZED, data }
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    const current = stateFrom(input.data)
    if (current.state === "canceled" || current.state === "deleted") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `Cannot capture a ${current.state} cash payment`)
    }
    if (current.state === "pending") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Cash payment must be authorized before capture")
    }
    if (current.state === "captured") return { data: current }
    return { data: { ...current, state: "captured", captured_at: new Date().toISOString() } }
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    const current = stateFrom(input.data)
    if (current.state === "canceled") return { data: current }
    if (current.state === "captured" && current.refunded_amount_minor < current.amount_minor) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Captured cash must be refunded, not canceled")
    }
    return { data: { ...current, state: "canceled", canceled_at: new Date().toISOString() } }
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const current = stateFrom(input.data)
    if (current.state !== "captured") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Only captured cash can be refunded")
    }
    const amount = numeric(input.amount, "refund amount")
    const amountMinor = toMinor(input.amount, current.currency_code)
    const idempotencyKey = input.context?.idempotency_key
    if (idempotencyKey && current.last_refund_idempotency_key === idempotencyKey) return { data: current }
    const refundedAmountMinor = current.refunded_amount_minor + amountMinor
    if (refundedAmountMinor > current.amount_minor) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Cash refund exceeds the captured amount")
    }
    return { data: { ...current, refunded_amount: current.refunded_amount + amount, refunded_amount_minor: refundedAmountMinor, last_refund_idempotency_key: idempotencyKey, last_refunded_at: new Date().toISOString() } }
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    return { data: { ...stateFrom(input.data) } }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    const current = stateFrom(input.data)
    if (current.state !== "pending") {
      if (numeric(input.amount, "amount") !== current.amount) {
        throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "An authorized cash payment amount cannot be changed")
      }
      return { status: current.state as PaymentSessionStatus, data: current }
    }
    const amount = numeric(input.amount, "amount")
    const amountMinor = toMinor(input.amount, input.currency_code)
    const tenderedAmount = numeric(input.data?.amount_tendered_minor ?? input.data?.tendered_amount ?? current.tendered_amount, "amount_tendered_minor")
    if (tenderedAmount < amountMinor) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Cash tendered is less than the payment amount")
    }
    return {
      status: PaymentSessionStatus.PENDING,
      data: { ...current, currency_code: input.currency_code.toLowerCase(), amount, amount_minor: amountMinor, tendered_amount: tenderedAmount, change_due: tenderedAmount - amountMinor, amount_tendered_minor: tenderedAmount, change_due_minor: tenderedAmount - amountMinor },
    }
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    const current = stateFrom(input.data)
    if (current.state === "captured") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "A captured cash payment cannot be deleted")
    }
    return { data: { ...current, state: "deleted", deleted_at: new Date().toISOString() } }
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const current = stateFrom(input.data)
    const status = current.state === "deleted" ? PaymentSessionStatus.CANCELED : current.state
    return { status: status as PaymentSessionStatus, data: current }
  }

  async getWebhookActionAndData(_payload: ProviderWebhookPayload["payload"]): Promise<WebhookActionResult> {
    return { action: PaymentActions.NOT_SUPPORTED }
  }
}
