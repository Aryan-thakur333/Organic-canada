import type PosModuleService from "../../modules/pos/service"

export type PosRole = "POS_OPERATOR" | "POS_MANAGER" | "ADMIN"
export type PosRecord = Record<string, unknown> & { id: string }
type PosAsyncMethod = (...args: unknown[]) => Promise<unknown>
export type PosService = Record<string, PosAsyncMethod> & {
  retrievePosRegister: PosModuleService["retrievePosRegister"]
}

export class PosError extends Error {
  constructor(public code: string, message: string, public status = 422, public details?: Record<string, unknown>) { super(message) }
}

export function integerMinor(value: unknown, field: string, allowZero = true): number {
  const amount = Number(value)
  if (!Number.isSafeInteger(amount) || amount < (allowZero ? 0 : 1)) throw new PosError("POS_VALIDATION_ERROR", `${field} must be a ${allowZero ? "non-negative" : "positive"} integer`, 400)
  return amount
}

export function posErrorResponse(error: unknown) {
  if (error instanceof PosError) return { status: error.status, body: { code: error.code, message: error.message, ...(error.details || {}) } }
  const message = error instanceof Error ? error.message : "Unexpected POS error"
  return { status: 500, body: { code: "POS_UNEXPECTED_ERROR", message } }
}
