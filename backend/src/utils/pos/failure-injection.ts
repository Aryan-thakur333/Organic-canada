import { PosError } from "./contracts"

export const POS_FAILURE_STAGES = [
  "AFTER_INVENTORY_RESERVATION",
  "AFTER_PAYMENT_AUTHORIZATION",
  "AFTER_ORDER_CREATION",
  "AFTER_PAYMENT_CAPTURE",
  "AFTER_OMS_INGESTION",
  "AFTER_RECEIPT_CREATION",
] as const

export type PosFailureStage = typeof POS_FAILURE_STAGES[number]

const injected = new Set<string>()

type FailureInjectionInput = {
  stage: PosFailureStage
  idempotencyKey: string
  requestedStage?: string | string[]
  suppliedToken?: string | string[]
}

export function injectControlledPosFailure(input: FailureInjectionInput) {
  if (process.env.NODE_ENV === "production" || process.env.POS_ALLOW_FAILURE_INJECTION !== "true") return
  const expectedToken = process.env.POS_FAILURE_INJECTION_TOKEN || ""
  const requestedStage = Array.isArray(input.requestedStage) ? input.requestedStage[0] : input.requestedStage
  const suppliedToken = Array.isArray(input.suppliedToken) ? input.suppliedToken[0] : input.suppliedToken
  if (!expectedToken || expectedToken.length < 16 || suppliedToken !== expectedToken) return
  if (requestedStage !== input.stage) return
  const injectionKey = `${input.stage}:${input.idempotencyKey}`
  if (injected.has(injectionKey)) return
  injected.add(injectionKey)
  throw new PosError(
    "POS_CONTROLLED_FAILURE",
    `Controlled non-production failure at ${input.stage}`,
    503,
    { stage: input.stage, retry_same_idempotency_key: true }
  )
}

export function resetControlledPosFailuresForTesting() {
  injected.clear()
}
