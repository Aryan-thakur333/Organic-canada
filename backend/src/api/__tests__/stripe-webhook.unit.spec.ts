import Stripe from "stripe"
import { POST as stripeWebhookPOST } from "../store/webhooks/stripe/route"
import { POST as subscriptionPaymentWebhookPOST } from "../store/webhook/subscription-payment/route"

const stripe = new Stripe("sk_test_mock_12345", { apiVersion: "2024-11-20.acacia" as any })

function createMockReqRes(options: {
  headers?: Record<string, string>
  body?: any
  rawBody?: string | Buffer
  containerScope?: Record<string, any>
}) {
  const req: any = {
    headers: options.headers || {},
    body: options.body,
    rawBody: options.rawBody,
    scope: {
      resolve: (key: string) => {
        if (options.containerScope && key in options.containerScope) {
          return options.containerScope[key]
        }
        return {
          retrieveSubscription: jest.fn().mockResolvedValue({ id: "sub_123", plan: "monthly" }),
          updateSubscriptions: jest.fn().mockResolvedValue({}),
          listSubscriptions: jest.fn().mockResolvedValue([{ id: "sub_123", plan: "monthly" }]),
          retrieveCustomer: jest.fn().mockResolvedValue({ id: "cus_123", metadata: {} }),
          updateCustomers: jest.fn().mockResolvedValue({}),
          retrieveQuote: jest.fn().mockResolvedValue({ id: "quote_123", metadata: {} }),
          updateQuotes: jest.fn().mockResolvedValue({}),
        }
      },
    },
  }

  const res: any = {
    statusCode: 200,
    headers: {},
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value
    },
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(data: any) {
      res.body = data
      return res
    },
  }

  return { req, res }
}

describe("Stripe Webhook Security & Execution Unit Tests", () => {
  const testSecret = "whsec_test_secret_for_unit_testing_12345"
  const originalEnvSecret = process.env.STRIPE_WEBHOOK_SECRET
  const originalApiKey = process.env.STRIPE_API_KEY

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.STRIPE_WEBHOOK_SECRET
    process.env.STRIPE_API_KEY = "sk_test_unit_only_123456789"
  })

  afterAll(() => {
    if (originalEnvSecret) {
      process.env.STRIPE_WEBHOOK_SECRET = originalEnvSecret
    } else {
      delete process.env.STRIPE_WEBHOOK_SECRET
    }
    if (originalApiKey) {
      process.env.STRIPE_API_KEY = originalApiKey
    } else {
      delete process.env.STRIPE_API_KEY
    }
  })

  // 1. Missing STRIPE_WEBHOOK_SECRET
  it("rejects request with HTTP 400 when STRIPE_WEBHOOK_SECRET is missing", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET
    const { req, res } = createMockReqRes({
      headers: { "stripe-signature": "t=123,v1=abc" },
      body: { type: "payment_intent.succeeded" },
    })

    await stripeWebhookPOST(req, res)
    expect(res.statusCode).toBe(400)
    expect(res.body.message).toMatch(/not configured/i)
  })

  it("rejects request with HTTP 400 when STRIPE_WEBHOOK_SECRET is incorrectly set to an API key (sk_test_...)", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "sk_test_confused_key_12345"
    const { req, res } = createMockReqRes({
      headers: { "stripe-signature": "t=123,v1=abc" },
      body: { type: "payment_intent.succeeded" },
    })

    await stripeWebhookPOST(req, res)
    expect(res.statusCode).toBe(400)
    expect(res.body.message).toMatch(/invalid webhook secret configuration/i)
  })

  // 2. Missing Stripe-Signature header
  it("rejects request with HTTP 400 when Stripe-Signature header is missing", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = testSecret
    const { req, res } = createMockReqRes({
      headers: {},
      body: { type: "payment_intent.succeeded" },
    })

    await stripeWebhookPOST(req, res)
    expect(res.statusCode).toBe(400)
    expect(res.body.message).toMatch(/missing stripe-signature/i)
  })

  // 3. Invalid signature
  it("rejects request with HTTP 400 when Stripe-Signature header is invalid", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = testSecret
    const { req, res } = createMockReqRes({
      headers: { "stripe-signature": "t=123,v1=invalid_signature_hash" },
      body: JSON.stringify({ id: "evt_test", type: "payment_intent.succeeded" }),
    })

    await stripeWebhookPOST(req, res)
    expect(res.statusCode).toBe(400)
    expect(res.body.message).toMatch(/verification failed/i)
  })

  // 4. Valid signed test event
  it("accepts a valid signed payment event without using it as a subscription renewal trigger", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = testSecret
    const payloadObject = {
      id: "evt_valid_123",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_valid_123",
          amount_received: 5000,
          currency: "cad",
          status: "succeeded",
          metadata: { subscription_id: "sub_123" },
        },
      },
    }
    const payloadString = JSON.stringify(payloadObject)
    const validSignature = stripe.webhooks.generateTestHeaderString({
      payload: payloadString,
      secret: testSecret,
    })

    const updateSubscriptionsMock = jest.fn().mockResolvedValue({})
    const mockScope = {
      subscription: {
        retrieveSubscription: jest.fn().mockResolvedValue({ id: "sub_123", plan: "monthly" }),
        updateSubscriptions: updateSubscriptionsMock,
      },
    }

    const { req, res } = createMockReqRes({
      headers: { "stripe-signature": validSignature },
      body: payloadObject,
      rawBody: payloadString,
      containerScope: mockScope,
    })

    await stripeWebhookPOST(req, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ received: true, type: "payment_intent.succeeded" })
    expect(updateSubscriptionsMock).not.toHaveBeenCalled()
  })

  // 5. Unknown event type
  it("handles unknown event types safely with HTTP 200 without throwing", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = testSecret
    const payloadObject = {
      id: "evt_unknown_123",
      type: "customer.discount.created",
      data: { object: { id: "disc_123" } },
    }
    const payloadString = JSON.stringify(payloadObject)
    const validSignature = stripe.webhooks.generateTestHeaderString({
      payload: payloadString,
      secret: testSecret,
    })

    const { req, res } = createMockReqRes({
      headers: { "stripe-signature": validSignature },
      body: payloadObject,
      rawBody: payloadString,
    })

    await stripeWebhookPOST(req, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ received: true, type: "customer.discount.created" })
  })

  // 6. Duplicate event delivery (idempotency check)
  it("processes duplicate events idempotently without crashing or corrupting state", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = testSecret
    const payloadObject = {
      id: "evt_dup_123",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_dup_123",
          amount_received: 2999,
          currency: "cad",
          status: "succeeded",
          metadata: { subscription_id: "sub_123" },
        },
      },
    }
    const payloadString = JSON.stringify(payloadObject)
    const validSignature = stripe.webhooks.generateTestHeaderString({
      payload: payloadString,
      secret: testSecret,
    })

    const updateSubscriptionsMock = jest.fn().mockResolvedValue({})
    const mockScope = {
      subscription: {
        retrieveSubscription: jest.fn().mockResolvedValue({ id: "sub_123", plan: "monthly" }),
        updateSubscriptions: updateSubscriptionsMock,
      },
    }

    // First invocation
    const { req: req1, res: res1 } = createMockReqRes({
      headers: { "stripe-signature": validSignature },
      body: payloadObject,
      rawBody: payloadString,
      containerScope: mockScope,
    })
    await stripeWebhookPOST(req1, res1)
    expect(res1.statusCode).toBe(200)

    // Second invocation (duplicate delivery)
    const { req: req2, res: res2 } = createMockReqRes({
      headers: { "stripe-signature": validSignature },
      body: payloadObject,
      rawBody: payloadString,
      containerScope: mockScope,
    })
    await stripeWebhookPOST(req2, res2)
    expect(res2.statusCode).toBe(200)
    expect(updateSubscriptionsMock).not.toHaveBeenCalled()
  })

  // 7. Malformed payload
  it("rejects malformed raw payloads with HTTP 400 during signature verification", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = testSecret
    const malformedRawBody = "{ invalid_json: "
    const validSignature = stripe.webhooks.generateTestHeaderString({
      payload: malformedRawBody,
      secret: testSecret,
    })

    const { req, res } = createMockReqRes({
      headers: { "stripe-signature": validSignature },
      body: {},
      rawBody: malformedRawBody,
    })

    await stripeWebhookPOST(req, res)
    // Note: constructEvent parses JSON inside after verifying signature, or fails
    expect(res.statusCode).toBe(400)
  })

  // 8. Handler failure
  it("returns HTTP 500 when underlying service handler throws an uncaught error", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = testSecret
    const payloadObject = {
      id: "evt_err_123",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_err_123",
          subscription: "sub_stripe_123",
          metadata: { subscription_id: "sub_123", customer_id: "cus_123" },
        },
      },
    }
    const payloadString = JSON.stringify(payloadObject)
    const validSignature = stripe.webhooks.generateTestHeaderString({
      payload: payloadString,
      secret: testSecret,
    })

    const mockScope = {
      subscription: {
        retrieveSubscription: jest.fn().mockRejectedValue(new Error("Database connection lost")),
      },
    }

    const { req, res } = createMockReqRes({
      headers: { "stripe-signature": validSignature },
      body: payloadObject,
      rawBody: payloadString,
      containerScope: mockScope,
    })

    await stripeWebhookPOST(req, res)
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ message: "Webhook handler failed" })
  })

  // 9. Secret not exposed in logs
  it("never logs the STRIPE_WEBHOOK_SECRET or secret key values", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = testSecret
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {})
    const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})
    const consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {})

    const { req, res } = createMockReqRes({
      headers: { "stripe-signature": "t=123,v1=invalid" },
      body: JSON.stringify({ type: "payment_intent.succeeded" }),
    })

    await stripeWebhookPOST(req, res)

    const allLoggedText = [
      ...consoleSpy.mock.calls.flat(),
      ...consoleWarnSpy.mock.calls.flat(),
      ...consoleLogSpy.mock.calls.flat(),
    ].join(" ")

    expect(allLoggedText).not.toContain(testSecret)

    consoleSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    consoleLogSpy.mockRestore()
  })

  // 10. No database write for rejected events
  it("ensures zero database or service calls occur for rejected webhook events", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = testSecret
    const updateSubscriptionsMock = jest.fn()
    const updateQuotesMock = jest.fn()

    const mockScope = {
      subscription: { updateSubscriptions: updateSubscriptionsMock },
      b2b: { updateQuotes: updateQuotesMock },
    }

    const { req, res } = createMockReqRes({
      headers: { "stripe-signature": "t=123,v1=bogus_sig" },
      body: { type: "payment_intent.succeeded" },
      containerScope: mockScope,
    })

    await stripeWebhookPOST(req, res)
    expect(res.statusCode).toBe(400)
    expect(updateSubscriptionsMock).not.toHaveBeenCalled()
    expect(updateQuotesMock).not.toHaveBeenCalled()
  })

  // Additional test suite for subscription-payment route
  describe("Subscription Payment Webhook Endpoint", () => {
    it("returns HTTP 410 for the retired duplicate endpoint", async () => {
      process.env.STRIPE_WEBHOOK_SECRET = testSecret
      const { req, res } = createMockReqRes({
        headers: {},
        body: { type: "payment_intent.succeeded", data: { object: { id: "pi_sub_123" } } },
      })

      await subscriptionPaymentWebhookPOST(req, res)
      expect(res.statusCode).toBe(410)
      expect(res.body.code).toBe("SUBSCRIPTION_WEBHOOK_RETIRED")
    })

    it("does not process even valid signed events on the retired endpoint", async () => {
      process.env.STRIPE_WEBHOOK_SECRET = testSecret
      const payloadObject = {
        type: "payment_intent.succeeded",
        data: {
          object: {
            id: "pi_sub_999",
            metadata: { subscription_id: "sub_999" },
          },
        },
      }
      const payloadString = JSON.stringify(payloadObject)
      const validSignature = stripe.webhooks.generateTestHeaderString({
        payload: payloadString,
        secret: testSecret,
      })

      const updateSubscriptionsMock = jest.fn().mockResolvedValue({})
      const mockScope = {
        subscription: {
          retrieveSubscription: jest.fn().mockResolvedValue({ id: "sub_999", plan: "monthly" }),
          updateSubscriptions: updateSubscriptionsMock,
        },
      }

      const { req, res } = createMockReqRes({
        headers: { "stripe-signature": validSignature },
        body: payloadObject,
        rawBody: payloadString,
        containerScope: mockScope,
      })

      await subscriptionPaymentWebhookPOST(req, res)
      expect(res.statusCode).toBe(410)
      expect(res.body.code).toBe("SUBSCRIPTION_WEBHOOK_RETIRED")
      expect(updateSubscriptionsMock).not.toHaveBeenCalled()
    })
  })
})
