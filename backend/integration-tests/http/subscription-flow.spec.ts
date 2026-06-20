import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
jest.setTimeout(60 * 1000)

// Create a mock reference that tests can use directly
const mockRetrieve = jest.fn()

// Mock Stripe so we can test the GET verification path without a live API key
jest.mock("stripe", () => ({
  __esModule: true,
  default: jest.fn(() => ({
    checkout: {
      sessions: {
        retrieve: mockRetrieve,
      },
    },
  })),
}))

medusaIntegrationTestRunner({
  inApp: true,
  env: {
    // Clear Stripe key so the POST handler uses mock/auto-activate mode
    STRIPE_API_KEY: "",
  },
  testSuite: ({ api, adminHeaders }) => {
    let customerId: string
    let authToken: string

    beforeAll(async () => {
      // Create a test customer for running the subscription flow
      const email = `sub-test-${Date.now()}@eatsie.test`
      const password = "TestPass123!"

      // Register via the Medusa auth flow
      const regResp = await api.post("/auth/customer/emailpass/register", {
        email,
        password,
      })
      authToken = regResp.body.token

      // Create the customer record
      const customerResp = await api.post(
        "/store/customers",
        {
          email,
          first_name: "Subscription",
          last_name: "Tester",
        },
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      )
      customerId = customerResp.body.customer?.id || customerResp.body.id
      expect(customerId).toBeTruthy()
    })

    describe("Mock Mode (no Stripe key) — POST auto-activates", () => {
      test("creates a subscription and activates premium metadata directly", async () => {
        const res = await api.post(
          "/store/subscriptions",
          {
            product_title: "Premium Membership Test",
            plan: "monthly",
            amount: 1000,
            currency: "usd",
          },
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          }
        )

        // Validate the response
        expect(res.status).toBe(201)
        expect(res.body.subscription).toBeDefined()
        expect(res.body.subscription.status).toBe("active")
        expect(res.body.subscription.plan).toBe("monthly")
        expect(res.body.subscription.amount).toBe(1000)

        const subscriptionId = res.body.subscription.id

        // Verify the customer metadata was updated with premium status
        // Fetch the customer via the admin API
        const customerRes = await api.get(
          `/admin/customers/${customerId}`,
          adminHeaders
        )

        const customer = customerRes.body.customer
        expect(customer).toBeDefined()
        expect(customer.metadata).toBeDefined()
        expect(customer.metadata.is_premium).toBe(true)
        expect(customer.metadata.subscription_id).toBe(subscriptionId)
        expect(customer.metadata.subscription_plan).toBe("monthly")
        expect(customer.metadata.premium_activated_at).toBeDefined()
      })
    })

    describe("Stripe Verification Path — GET session verification", () => {
      const fakeSessionId = "cs_test_fake_session_123"

      beforeEach(() => {
        mockRetrieve.mockReset()
      })

      test("returns 400 when session_id is missing", async () => {
        const res = await api.get("/store/subscriptions")
        expect(res.status).toBe(400)
        expect(res.body.success).toBe(false)
        expect(res.body.message).toContain("Missing session_id")
      })

      test("returns 402 when payment has not been completed", async () => {
        // Mock a session where payment is not yet complete
        mockRetrieve.mockResolvedValueOnce({
          id: fakeSessionId,
          payment_status: "unpaid",
          metadata: {},
        })

        const res = await api.get(
          `/store/subscriptions?session_id=${fakeSessionId}`
        )
        expect(res.status).toBe(402)
        expect(res.body.success).toBe(false)
        expect(res.body.payment_status).toBe("unpaid")
      })

      test("returns 400 when session metadata is missing subscription_id or customer_id", async () => {
        mockRetrieve.mockResolvedValueOnce({
          id: fakeSessionId,
          payment_status: "paid",
          metadata: {},
        })

        const res = await api.get(
          `/store/subscriptions?session_id=${fakeSessionId}`
        )
        expect(res.status).toBe(400)
        expect(res.body.success).toBe(false)
        expect(res.body.message).toContain("metadata")
      })

      test("activates premium on valid completed session", async () => {
        // First create a subscription via POST in Stripe mode
        // We need to simulate: we have a subscription in "trialing" that
        // the GET handler will activate
        const subEmail = `sub-verify-${Date.now()}@eatsie.test`
        const subPassword = "VerifyPass123!"

        // Register another customer
        const regResp = await api.post("/auth/customer/emailpass/register", {
          email: subEmail,
          password: subPassword,
        })
        const verifyToken = regResp.body.token

        const custResp = await api.post(
          "/store/customers",
          {
            email: subEmail,
            first_name: "Verify",
            last_name: "Tester",
          },
          {
            headers: { Authorization: `Bearer ${verifyToken}` },
          }
        )
        const verifyCustomerId =
          custResp.body.customer?.id || custResp.body.id

        // Create a subscription (will be in "trialing" since no Stripe key
        // but we need a real subscription record for the GET handler)
        // The mock mode sets status to "active", but the GET handler expects
        // to find it by ID and update it. We'll create one manually.
        const createRes = await api.post(
          "/store/subscriptions",
          {
            product_title: "Verification Premium",
            plan: "monthly",
            amount: 1500,
            currency: "usd",
          },
          {
            headers: { Authorization: `Bearer ${verifyToken}` },
          }
        )

        const subId = createRes.body.subscription.id

        // Mock a successful Stripe session that matches our data
        mockRetrieve.mockResolvedValueOnce({
          id: `cs_test_${Date.now()}`,
          payment_status: "paid",
          metadata: {
            subscription_id: subId,
            customer_id: verifyCustomerId,
          },
          subscription: `sub_mock_${Date.now()}`,
        })

        // Call the GET verification endpoint
        const verifyRes = await api.get(
          `/store/subscriptions?session_id=cs_test_${Date.now()}`
        )

        expect(verifyRes.status).toBe(200)
        expect(verifyRes.body.success).toBe(true)
        expect(verifyRes.body.customer.metadata.is_premium).toBe(true)
        expect(verifyRes.body.customer.metadata.subscription_id).toBe(subId)

        // Verify the customer metadata was actually updated in the database
        const customerCheck = await api.get(
          `/admin/customers/${verifyCustomerId}`,
          adminHeaders
        )
        const updatedCustomer = customerCheck.body.customer
        expect(updatedCustomer.metadata.is_premium).toBe(true)
        expect(updatedCustomer.metadata.subscription_id).toBe(subId)
        expect(updatedCustomer.metadata.premium_activated_at).toBeDefined()
        expect(updatedCustomer.metadata.premium_session_id).toBeDefined()
      })

      test("handles Stripe API errors gracefully", async () => {
        // Mock a Stripe error
        mockRetrieve.mockRejectedValueOnce({
          type: "StripeInvalidRequestError",
          message: "No such checkout session: `cs_test_invalid`",
        })

        const res = await api.get(
          "/store/subscriptions?session_id=cs_test_invalid"
        )
        expect(res.status).toBe(400)
        expect(res.body.success).toBe(false)
        expect(res.body.message).toContain("Invalid Stripe session")
      })
    })

    describe("Subscription Listing — GET /store/subscriptions", () => {
      test("returns subscriptions for authenticated customer", async () => {
        const res = await api.get("/store/subscriptions", {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        })

        expect(res.status).toBe(200)
        expect(Array.isArray(res.body.subscriptions)).toBe(true)
        // The customer created in the mock mode test should have at least 1
        expect(res.body.subscriptions.length).toBeGreaterThanOrEqual(1)
      })
    })

    describe("Error Handling — POST /store/subscriptions", () => {
      test("returns 401 without authentication", async () => {
        const res = await api.post("/store/subscriptions", {
          plan: "monthly",
          amount: 1000,
        })
        expect(res.status).toBe(401)
      })

      test("returns 400 when plan or amount is missing", async () => {
        const res = await api.post(
          "/store/subscriptions",
          { product_title: "Test" },
          {
            headers: { Authorization: `Bearer ${authToken}` },
          }
        )
        expect(res.status).toBe(400)
        expect(res.body.message).toContain("Plan and amount")
      })
    })
  },
})
