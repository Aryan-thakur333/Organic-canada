import fs from "node:fs"
import path from "node:path"
import {
  calculateSubscriptionUnitPrice,
  canTransitionSubscription,
  createSubscriptionFingerprint,
  INTERVAL_TO_PLAN,
} from "../contract"
import { isCommerceFeatureEnabled } from "../../../lib/commerce-feature-flags"
import { POST as createSubscription } from "../../../api/store/subscriptions/route"

const read = (...segments: string[]) => fs.readFileSync(path.join(process.cwd(), ...segments), "utf8")

describe("production subscription contract", () => {
  const originalFlag = process.env.FEATURE_SUBSCRIPTIONS
  afterEach(() => { process.env.FEATURE_SUBSCRIPTIONS = originalFlag })

  it("legacy schedules cannot charge or directly create renewal orders", () => {
    for (const file of ["subscription-renewal.ts", "failed-payment-retry.ts"]) {
      const source = read("src", "jobs", file)
      expect(source).not.toContain("paymentIntents.create")
      expect(source).not.toContain("createOrders")
    }
  })

  it("supports the four canonical intervals", () => {
    expect(INTERVAL_TO_PLAN).toEqual({ WEEK: "weekly", MONTH: "monthly", QUARTER: "quarterly", YEAR: "yearly" })
  })

  it("calculates percentage adjustments in basis points", () => {
    expect(calculateSubscriptionUnitPrice(2500, { discount_type: "percentage", discount_value: 1000 })).toBe(2250)
  })

  it("calculates fixed minor-unit adjustments", () => {
    expect(calculateSubscriptionUnitPrice(2500, { discount_type: "fixed", discount_value: 300 })).toBe(2200)
  })

  it("never permits a negative subscription price", () => {
    expect(calculateSubscriptionUnitPrice(200, { discount_type: "fixed", discount_value: 500 })).toBe(0)
  })

  it("creates deterministic customer/cart fingerprints", () => {
    const input = { customerId: "cus_1", cartId: "cart_1", interval: "MONTH" as const, intervalCount: 1 }
    expect(createSubscriptionFingerprint(input)).toBe(createSubscriptionFingerprint(input))
    expect(createSubscriptionFingerprint(input)).not.toBe(createSubscriptionFingerprint({ ...input, cartId: "cart_2" }))
  })

  it("allows pause/resume/cancel transitions", () => {
    expect(canTransitionSubscription("active", "paused")).toBe(true)
    expect(canTransitionSubscription("paused", "active")).toBe(true)
    expect(canTransitionSubscription("past_due", "cancelled")).toBe(true)
  })

  it("forbids cancelled reactivation", () => {
    expect(canTransitionSubscription("cancelled", "active")).toBe(false)
  })

  it("keeps feature flags opt-in", () => {
    delete process.env.FEATURE_SUBSCRIPTIONS
    expect(isCommerceFeatureEnabled("subscriptions")).toBe(false)
    process.env.FEATURE_SUBSCRIPTIONS = "true"
    expect(isCommerceFeatureEnabled("subscriptions")).toBe(true)
  })

  it("rejects unauthenticated creation before cart or provider access", async () => {
    const req = { auth_context: {}, body: {}, scope: { resolve: jest.fn() } } as any
    const res: any = { statusCode: 200, body: null, status(code: number) { this.statusCode = code; return this }, json(body: any) { this.body = body; return this } }
    await createSubscription(req, res)
    expect(res.statusCode).toBe(401)
    expect(req.scope.resolve).not.toHaveBeenCalled()
  })

  it("uses strict input without accepting client prices", () => {
    const source = read("src", "api", "store", "subscriptions", "route.ts")
    expect(source).toContain(".strict()")
    expect(source).not.toMatch(/unit_price\s*:/)
    expect(source).toContain("item.unit_price")
  })

  it("requires server-side product eligibility", () => {
    const source = read("src", "api", "store", "subscriptions", "route.ts")
    expect(source).toContain("listSubscriptionProductConfigurations")
    expect(source).toContain("SUBSCRIPTION_ITEM_INELIGIBLE")
  })

  it("has durable creation, billing-period, provider, and order uniqueness", () => {
    const migration = read("src", "modules", "subscription", "migrations", "Migration20260730000001.ts")
    expect(migration).toContain("UIDX_subscription_customer_idempotency")
    expect(migration).toContain("UIDX_subscription_order_period")
    expect(migration).toContain("UIDX_subscription_provider_event")
    expect(migration).toContain("UIDX_subscription_provider_subscription")
  })

  it("scheduled reconciliation cannot create charges or orders", () => {
    const source = read("src", "jobs", "subscription-billing.ts")
    expect(source).not.toContain("paymentIntents.create")
    expect(source).not.toContain("createOrders")
    expect(source).toContain("subscriptions.retrieve")
  })

  it("compatibility renewal workflow cannot create charges or orders", () => {
    const source = read("src", "workflows", "trigger-subscription-order.ts")
    expect(source).not.toContain("paymentIntents")
    expect(source).not.toContain("createOrders")
    expect(source).toContain('charge_owner: "stripe_billing"')
  })

  it("paid invoices claim provider events and billing periods before order creation", () => {
    const source = read("src", "modules", "subscription", "stripe-event-processor.ts")
    expect(source.indexOf("createSubscriptionProviderEvents")).toBeLessThan(source.indexOf("createOrderWorkflow(container)"))
    expect(source.indexOf("createSubscriptionBillingOrders")).toBeLessThan(source.indexOf("createOrderWorkflow(container)"))
  })

  it("failed invoices cannot create an order", () => {
    const source = read("src", "modules", "subscription", "stripe-event-processor.ts")
    const failedSection = source.slice(source.indexOf('event.type === "invoice.payment_failed"'))
    expect(failedSection.slice(0, failedSection.indexOf('event.type === "customer.subscription.updated"'))).not.toContain("createOrderWorkflow")
  })
})
