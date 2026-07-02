import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"

jest.setTimeout(120 * 1000)

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, adminHeaders, getContainer }) => {
    // ── Shared state ────────────────────────────────────────────────────
    let customerAuthToken: string
    let customerId: string
    let companyId: string
    let draftQuoteId: string
    let testVariantId: string
    let testProductId: string
    let secondVariantId: string
    let secondProductId: string

    // ── Helper: create an authenticated customer ────────────────────────
    async function createAuthCustomer(
      suffix: string
    ): Promise<{ token: string; id: string }> {
      const email = `b2b-quote-${suffix}-${Date.now()}@eatsie.test`
      const password = "TestPass123!"

      // Register via Medusa auth
      const regResp = await api.post("/auth/customer/emailpass/register", {
        email,
        password,
      })
      const token: string = regResp.data.token

      // Create the customer record
      const custResp = await api.post(
        "/store/customers",
        { email, first_name: "B2B", last_name: "Tester" },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const id = custResp.data.customer?.id || custResp.data.id
      expect(id).toBeTruthy()

      return { token, id }
    }

    // ── Helper: create a B2B company linked to a customer ───────────────
    async function createCompany(
      token: string,
      name: string
    ): Promise<string> {
      const res = await api.post(
        "/store/b2b/company",
        {
          company_name: name,
          tax_id: `TAX-${Date.now()}`,
          credit_limit: 100000, // $1,000.00 in cents
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )

      expect(res.status).toBe(201)
      expect(res.data.company).toBeDefined()
      expect(res.data.company.company_name).toBe(name)
      expect(res.data.company.id).toBeTruthy()

      return res.data.company.id
    }

    // ═══════════════════════════════════════════════════════════════════
    //  SETUP: Create test products, customer, and company
    // ═══════════════════════════════════════════════════════════════════
    beforeAll(async () => {
      // Create test products with variants via the Medusa container
      const container = getContainer()
      const productModuleService: any = container.resolve(Modules.PRODUCT)

      const [product1] = await productModuleService.createProducts([
        {
          title: "Organic Apple Box (12 ct)",
          variants: [
            {
              title: "Default Variant",
              sku: "ORG-APP-12",
              prices: [
                { amount: 2400, currency_code: "cad" },
              ],
            },
          ],
        },
      ])
      testProductId = product1.id
      testVariantId = product1.variants[0].id

      const [product2] = await productModuleService.createProducts([
        {
          title: "Heirloom Tomato Basket (5 lbs)",
          variants: [
            {
              title: "Default Variant",
              sku: "HRM-TOM-5",
              prices: [
                { amount: 1800, currency_code: "cad" },
              ],
            },
          ],
        },
      ])
      secondProductId = product2.id
      secondVariantId = product2.variants[0].id

      // Create authenticated customer and company
      const auth = await createAuthCustomer("primary")
      customerAuthToken = auth.token
      customerId = auth.id

      companyId = await createCompany(customerAuthToken, "Acme Organic Farms")
    })

    // ═══════════════════════════════════════════════════════════════════
    //  STORE: Submit and list quotes
    // ═══════════════════════════════════════════════════════════════════

    describe("POST /store/b2b/quotes — Submit draft quote", () => {
      test("returns 401 without authentication", async () => {
        const res = await api.post("/store/b2b/quotes", {
          items: [{ product_id: testProductId, variant_id: testVariantId, quantity: 1 }],
        })
        expect(res.status).toBe(401)
      })

      test("returns 400 when items array is empty", async () => {
        const res = await api.post(
          "/store/b2b/quotes",
          { items: [] },
          { headers: { Authorization: `Bearer ${customerAuthToken}` } }
        )
        expect(res.status).toBe(400)
        expect(res.data.message).toContain("item")
      })

      test("returns 400 when variant_id is missing", async () => {
        const res = await api.post(
          "/store/b2b/quotes",
          { items: [{ product_id: testProductId, quantity: 1 }] },
          { headers: { Authorization: `Bearer ${customerAuthToken}` } }
        )
        expect(res.status).toBe(400)
        expect(res.data.message).toContain("variant_id")
      })

      test("returns 400 when quantity is invalid", async () => {
        const res = await api.post(
          "/store/b2b/quotes",
          { items: [{ product_id: testProductId, variant_id: testVariantId, quantity: 0 }] },
          { headers: { Authorization: `Bearer ${customerAuthToken}` } }
        )
        expect(res.status).toBe(400)
        expect(res.data.message).toContain("quantity")
      })

      test("creates a draft quote with valid line items", async () => {
        const items = [
          {
            product_id: testProductId,
            variant_id: testVariantId,
            quantity: 20,
          },
          {
            product_id: secondProductId,
            variant_id: secondVariantId,
            quantity: 10,
          },
        ]

        const res = await api.post(
          "/store/b2b/quotes",
          {
            items,
            buyer_note: "Weekly delivery for our farm-to-table event.",
            currency_code: "cad",
            region_id: "test-region",
          },
          { headers: { Authorization: `Bearer ${customerAuthToken}` } }
        )

        expect(res.status).toBe(201)
        expect(res.data.quote).toBeDefined()
        expect(res.data.quote.status).toBe("pending_review")
        expect(res.data.quote.company_id).toBe(companyId)
        expect(res.data.quote.requested_items).toHaveLength(2)

        draftQuoteId = res.data.quote.id
      })

      test("creates a quote without buyer_note", async () => {
        const res = await api.post(
          "/store/b2b/quotes",
          {
            items: [
              { product_id: testProductId, variant_id: testVariantId, quantity: 5 },
            ],
            currency_code: "cad",
            region_id: "test-region",
          },
          { headers: { Authorization: `Bearer ${customerAuthToken}` } }
        )

        expect(res.status).toBe(201)
        expect(res.data.quote.buyer_note).toBeNull()
      })
    })

    describe("GET /store/b2b/quotes — Customer lists their quotes", () => {
      test("returns 401 without authentication", async () => {
        const res = await api.get("/store/b2b/quotes")
        expect(res.status).toBe(401)
      })

      test("returns the customer's quotes, most recent first", async () => {
        const res = await api.get("/store/b2b/quotes", {
          headers: { Authorization: `Bearer ${customerAuthToken}` },
        })

        expect(res.status).toBe(200)
        expect(Array.isArray(res.data.quotes)).toBe(true)
        expect(res.data.quotes.length).toBeGreaterThanOrEqual(2)
        expect(res.data.count).toBeGreaterThanOrEqual(2)

        // Most recent quote should be first
        if (res.data.quotes.length >= 2) {
          const dates = res.data.quotes.map(
            (q: any) => new Date(q.created_at).getTime()
          )
          for (let i = 1; i < dates.length; i++) {
            expect(dates[i]).toBeLessThanOrEqual(dates[i - 1])
          }
        }

        // Each quote should have the expected shape
        const first = res.data.quotes[0]
        expect(first.id).toBeTruthy()
        expect(first.status).toBeTruthy()
        expect(first.requested_items).toBeDefined()
        expect(first.created_at).toBeTruthy()
      })

      test("filters by status query param", async () => {
        const res = await api.get("/store/b2b/quotes?status=pending_review", {
          headers: { Authorization: `Bearer ${customerAuthToken}` },
        })

        expect(res.status).toBe(200)
        expect(Array.isArray(res.data.quotes)).toBe(true)
        for (const q of res.data.quotes) {
          expect(q.status).toBe("pending_review")
        }
      })

      test("returns empty array when no quotes match status filter", async () => {
        const res = await api.get("/store/b2b/quotes?status=converted_to_order", {
          headers: { Authorization: `Bearer ${customerAuthToken}` },
        })

        expect(res.status).toBe(200)
        expect(res.data.quotes).toHaveLength(0)
        expect(res.data.count).toBe(0)
      })
    })

    describe("GET /store/b2b/quotes — Customer cannot see other customers' quotes", () => {
      test("returns only own quotes for a different customer", async () => {
        // Create a second customer + company
        const secondAuth = await createAuthCustomer("secondary")
        const secondCompany = await createCompany(
          secondAuth.token,
          "Green Valley Co-op"
        )

        // Submit a quote as the second customer
        await api.post(
          "/store/b2b/quotes",
          {
            items: [{ product_id: testProductId, variant_id: testVariantId, quantity: 1 }],
            currency_code: "cad",
            region_id: "test-region",
          },
          { headers: { Authorization: `Bearer ${secondAuth.token}` } }
        )

        // The primary customer should NOT see the second customer's quote
        const primaryRes = await api.get("/store/b2b/quotes", {
          headers: { Authorization: `Bearer ${customerAuthToken}` },
        })

        for (const q of primaryRes.data.quotes) {
          expect(q.customer_id).toBe(customerId)
          expect(q.company_id).toBe(companyId)
        }
      })
    })

    // ═══════════════════════════════════════════════════════════════════
    //  ERROR HANDLING: Edge cases
    // ═══════════════════════════════════════════════════════════════════

    describe("Error handling — edge cases", () => {
      test("returns 401 when no auth token for store quote submission", async () => {
        const res = await api.post("/store/b2b/quotes", {
          items: [{ product_id: testProductId, variant_id: testVariantId, quantity: 1 }],
        })
        expect(res.status).toBe(401)
      })

      test("returns 400 when company does not exist for customer", async () => {
        // Create a customer with no company
        const noCompAuth = await createAuthCustomer("no-company")

        const res = await api.post(
          "/store/b2b/quotes",
          {
            items: [{ product_id: testProductId, variant_id: testVariantId, quantity: 1 }],
            currency_code: "cad",
            region_id: "test-region",
          },
          { headers: { Authorization: `Bearer ${noCompAuth.token}` } }
        )

        expect(res.status).toBe(400)
        expect(res.data.message).toContain("company")
      })
    })
  },
})
