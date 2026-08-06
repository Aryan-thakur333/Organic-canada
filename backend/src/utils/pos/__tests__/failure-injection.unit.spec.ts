import { injectControlledPosFailure, resetControlledPosFailuresForTesting } from "../failure-injection"

describe("controlled POS failure injection", () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: "test", POS_ALLOW_FAILURE_INJECTION: "true", POS_FAILURE_INJECTION_TOKEN: "1234567890abcdef" }
    resetControlledPosFailuresForTesting()
  })

  afterAll(() => { process.env = originalEnv })

  it("injects a requested stage once per idempotency key so retry can recover", () => {
    const input = { stage: "AFTER_PAYMENT_CAPTURE" as const, idempotencyKey: "idem-1", requestedStage: "AFTER_PAYMENT_CAPTURE", suppliedToken: "1234567890abcdef" }
    expect(() => injectControlledPosFailure(input)).toThrow("Controlled non-production failure")
    expect(() => injectControlledPosFailure(input)).not.toThrow()
  })

  it("requires the configured token", () => {
    expect(() => injectControlledPosFailure({ stage: "AFTER_OMS_INGESTION", idempotencyKey: "idem-2", requestedStage: "AFTER_OMS_INGESTION", suppliedToken: "wrong" })).not.toThrow()
  })

  it("is disabled unconditionally in production", () => {
    process.env.NODE_ENV = "production"
    expect(() => injectControlledPosFailure({ stage: "AFTER_RECEIPT_CREATION", idempotencyKey: "idem-3", requestedStage: "AFTER_RECEIPT_CREATION", suppliedToken: "1234567890abcdef" })).not.toThrow()
  })
})
