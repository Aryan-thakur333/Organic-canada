import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  createApiKeysWorkflow,
  createSalesChannelsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows"
import { SUBSCRIPTION_MODULE } from "../../src/modules/subscription"

jest.setTimeout(120 * 1000)

/**
 * Integration test for the store subscription API surface (cart-based checkout):
 *
 *   1. Auth enforcement (401 without a customer token)
 *   2. Input validation (zod) on POST /store/subscriptions
 *   3. Payment-unavailable 503 when Stripe is not configured
 *   4. GET list + detail with items/orders
 *   5. Lifecycle: cancel, pause (provider pending 409), retry past-due
 *   6. Ownership guards (another customer cannot read/manage)
 */
medusaIntegrationTestRunner({
  inApp: true,
  disableAutoTeardown: true,
  env: {
    // Enable the subscription commerce feature and clear Stripe so the
    // POST path exercises the no-provider 503 branch.
    FEATURE_SUBSCRIPTIONS: "true",
    STRIPE_API_KEY: "",
  },
  testSuite: ({ api, getContainer }) => {
    let publishableApiKey: string
    let customerId: string
    let authToken: string

    function withDefaults(headers: Record<string, string> = {}) {
      return {
        validateStatus: () => true,
        headers: {
          ...(publishableApiKey ? { "x-publishable-api-key": publishableApiKey } : {}),
          ...headers,
        },
      }
    }

    function authHeaders(token: string) {
      return { Authorization: `Bearer ${token}` }
    }

    function storeHeaders(token?: string) {
      return withDefaults(token ? authHeaders(token) : {})
    }

    beforeAll(async () => {
      const container = getContainer()
      const query: any = container.resolve("query")

      const { data: salesChannels } = await query.graph({
        entity: "sales_channel",
        fields: ["id"],
        pagination: { take: 1 },
      })

      let salesChannelId = salesChannels?.[0]?.id
      if (!salesChannelId) {
        const { result } = await createSalesChannelsWorkflow(container).run({
          input: { salesChannelsData: [{ name: "Subscription Test Channel" }] },
        })
        salesChannelId = result[0].id
      }

      const {
        result: [apiKey],
      } = await createApiKeysWorkflow(container).run({
        input: {
          api_keys: [
            {
              title: "Subscription test publishable key",
              type: "publishable",
              created_by: "",
            },
          ],
        },
      })
      publishableApiKey = apiKey.token

      await linkSalesChannelsToApiKeyWorkflow(container).run({
        input: { id: apiKey.id, add: [salesChannelId] },
      })

      // Create a test customer
      const email = `sub-test-${Date.now()}@eatsie.test`
      const password = "TestPass123!"
      const regResp = await api.post(
        "/auth/customer/emailpass/register",
        { email, password },
        withDefaults()
      )
      expect(regResp.status).toBe(200)
      expect(regResp.data.token).toBeTruthy()

      const custResp = await api.post(
        "/store/customers",
        { email, first_name: "Subscription", last_name: "Tester" },
        storeHeaders(regResp.data.token)
      )
      customerId = custResp.data.customer?.id || custResp.data.id
      expect(customerId).toBeTruthy()

      const loginResp = await api.post(
        "/auth/customer/emailpass",
        { email, password },
        withDefaults()
      )
      expect(loginResp.status).toBe(200)
      expect(loginResp.data.token).toBeTruthy()
      authToken = loginResp.data.token
    })

    describe("POST /store/subscriptions — auth + validation", () => {
      test("returns 401 without authentication", async () => {
        const res = await api.post(
          "/store/subscriptions",
          {
            cart_id: "cart_x",
            interval: "MONTH",
            interval_count: 1,
            idempotency_key: "sub-auth-check",
          },
          storeHeaders()
        )
        expect(res.status).toBe(401)
      })

      test("returns 400 when required fields are missing", async () => {
        const res = await api.post(
          "/store/subscriptions",
          { cart_id: "cart_x" },
          storeHeaders(authToken)
        )
        expect(res.status).toBe(400)
        expect(res.data.code).toBe("SUBSCRIPTION_INPUT_INVALID")
      })

      test("returns 400 for an invalid interval", async () => {
        const res = await api.post(
          "/store/subscriptions",
          {
            cart_id: "cart_x",
            interval: "BIANNUAL",
            interval_count: 1,
            idempotency_key: "sub-invalid-interval",
          },
          storeHeaders(authToken)
        )
        expect(res.status).toBe(400)
        expect(res.data.code).toBe("SUBSCRIPTION_INPUT_INVALID")
      })

      test("returns 503 when no payment provider is configured", async () => {
        const res = await api.post(
          "/store/subscriptions",
          {
            cart_id: "cart_missing",
            interval: "MONTH",
            interval_count: 1,
            idempotency_key: `sub-503-${Date.now()}`,
          },
          storeHeaders(authToken)
        )
        expect(res.status).toBe(503)
        expect(res.data.code).toBe("SUBSCRIPTION_PAYMENT_UNAVAILABLE")
      })
    })

    describe("GET /store/subscriptions — list + detail", () => {
      let createdSubscriptionId: string

      beforeAll(async () => {
        const subscriptionService: any = getContainer().resolve(SUBSCRIPTION_MODULE)
        const created = await subscriptionService.createSubscriptions({
          customer_id: customerId,
          customer_email: `sub-test-${Date.now()}@eatsie.test`,
          plan: "monthly",
          status: "active",
          amount: 1000,
          currency: "usd",
          interval_count: 1,
          payment_provider: "stripe_billing",
          idempotency_key: `sub-seed-${Date.now()}`,
          metadata: { source: "integration-test" },
        })
        createdSubscriptionId = created.id
      })

      test("returns 401 without authentication", async () => {
        const res = await api.get("/store/subscriptions", storeHeaders())
        expect(res.status).toBe(401)
      })

      test("lists the customer's subscriptions", async () => {
        const res = await api.get("/store/subscriptions", storeHeaders(authToken))
        expect(res.status).toBe(200)
        expect(Array.isArray(res.data.subscriptions)).toBe(true)
        expect(res.data.subscriptions.some((s: any) => s.id === createdSubscriptionId)).toBe(true)
      })

      test("returns detail with items and orders", async () => {
        const res = await api.get(
          `/store/subscriptions/${createdSubscriptionId}`,
          storeHeaders(authToken)
        )
        expect(res.status).toBe(200)
        expect(res.data.subscription.id).toBe(createdSubscriptionId)
        expect(res.data.subscription.customer_id).toBe(customerId)
        expect(Array.isArray(res.data.items)).toBe(true)
        expect(Array.isArray(res.data.orders)).toBe(true)
      })

      test("hides another customer's subscription", async () => {
        const otherEmail = `sub-other-${Date.now()}@eatsie.test`
        const otherPassword = "OtherPass123!"
        const otherReg = await api.post(
          "/auth/customer/emailpass/register",
          { email: otherEmail, password: otherPassword },
          withDefaults()
        )
        const otherCust = await api.post(
          "/store/customers",
          { email: otherEmail, first_name: "Other", last_name: "Customer" },
          storeHeaders(otherReg.data.token)
        )
        const otherLogin = await api.post(
          "/auth/customer/emailpass",
          { email: otherEmail, password: otherPassword },
          withDefaults()
        )
        const otherToken = otherLogin.data.token

        const listRes = await api.get("/store/subscriptions", storeHeaders(otherToken))
        expect(listRes.status).toBe(200)
        expect(listRes.data.subscriptions.some((s: any) => s.id === createdSubscriptionId)).toBe(false)

        const detailRes = await api.get(
          `/store/subscriptions/${createdSubscriptionId}`,
          storeHeaders(otherToken)
        )
        expect(detailRes.status).toBe(404)
      })
    })

    describe("Lifecycle — cancel, pause, retry", () => {
      let activeSubscriptionId: string

      beforeAll(async () => {
        const subscriptionService: any = getContainer().resolve(SUBSCRIPTION_MODULE)
        const created = await subscriptionService.createSubscriptions({
          customer_id: customerId,
          customer_email: `sub-lifecycle-${Date.now()}@eatsie.test`,
          plan: "monthly",
          status: "active",
          amount: 2500,
          currency: "cad",
          interval_count: 1,
          payment_provider: "stripe_billing",
          metadata: { source: "integration-test-lifecycle" },
        })
        activeSubscriptionId = created.id
      })

      test("pause returns provider-pending 409 without a Stripe subscription", async () => {
        const res = await api.post(
          `/store/subscriptions/${activeSubscriptionId}/pause`,
          {},
          storeHeaders(authToken)
        )
        expect(res.status).toBe(409)
        expect(res.data.code).toBe("SUBSCRIPTION_PROVIDER_PENDING")
      })

      test("cancel succeeds and marks the subscription cancelled", async () => {
        const res = await api.post(
          `/store/subscriptions/${activeSubscriptionId}/cancel`,
          {},
          storeHeaders(authToken)
        )
        expect(res.status).toBe(200)
        expect(res.data.subscription.status).toBe("cancelled")
        expect(res.data.subscription.cancelled_at).toBeTruthy()
      })

      test("cancelled subscription cannot be cancelled again (idempotent)", async () => {
        const res = await api.post(
          `/store/subscriptions/${activeSubscriptionId}/cancel`,
          {},
          storeHeaders(authToken)
        )
        expect(res.status).toBe(200)
        expect(res.data.subscription.status).toBe("cancelled")
        expect(res.data.reused).toBe(true)
      })

      test("retry rejects non past-due subscriptions", async () => {
        const res = await api.post(
          `/store/subscriptions/${activeSubscriptionId}/retry`,
          {},
          storeHeaders(authToken)
        )
        expect(res.status).toBe(400)
        expect(res.data.message).toContain("past-due")
      })

      test("retry reactivates a past-due subscription", async () => {
        const subscriptionService: any = getContainer().resolve(SUBSCRIPTION_MODULE)
        const pastDue = await subscriptionService.createSubscriptions({
          customer_id: customerId,
          customer_email: `sub-retry-${Date.now()}@eatsie.test`,
          plan: "monthly",
          status: "past_due",
          amount: 1200,
          currency: "usd",
          interval_count: 1,
          failed_payment_count: 2,
          payment_provider: "stripe_billing",
          metadata: { source: "integration-test-retry" },
        })

        const res = await api.post(
          `/store/subscriptions/${pastDue.id}/retry`,
          {},
          storeHeaders(authToken)
        )
        expect(res.status).toBe(200)
        expect(res.data.subscription.status).toBe("active")
        expect(res.data.subscription.failed_payment_count).toBe(0)
      })

      test("another customer cannot cancel the subscription", async () => {
        const otherEmail = `sub-owner-${Date.now()}@eatsie.test`
        const otherPassword = "OwnerPass123!"
        const otherReg = await api.post(
          "/auth/customer/emailpass/register",
          { email: otherEmail, password: otherPassword },
          withDefaults()
        )
        await api.post(
          "/store/customers",
          { email: otherEmail, first_name: "Owner", last_name: "Guard" },
          storeHeaders(otherReg.data.token)
        )
        const otherLogin = await api.post(
          "/auth/customer/emailpass",
          { email: otherEmail, password: otherPassword },
          withDefaults()
        )
        const otherToken = otherLogin.data.token

        const res = await api.post(
          `/store/subscriptions/${activeSubscriptionId}/cancel`,
          {},
          storeHeaders(otherToken)
        )
        expect(res.status).toBe(404)
      })
    })
  },
})
