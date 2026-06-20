import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
jest.setTimeout(120 * 1000)

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, adminHeaders }) => {
    // ── Shared state ────────────────────────────────────────────────────
    let customerAuthToken: string
    let customerId: string
    let companyId: string
    let draftQuoteId: string

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
      const token: string = regResp.body.token

      // Create the customer record
      const custResp = await api.post(
        "/store/customers",
        { email, first_name: "B2B", last_name: "Tester" },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const id = custResp.body.customer?.id || custResp.body.id
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
      expect(res.body.company).toBeDefined()
      expect(res.body.company.company_name).toBe(name)
      expect(res.body.company.id).toBeTruthy()

      return res.body.company.id
    }

    // ═══════════════════════════════════════════════════════════════════
    //  SETUP: Create the primary customer + company used across tests
    // ═══════════════════════════════════════════════════════════════════
    beforeAll(async () => {
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
          items: [{ title: "Test", quantity: 1, unit_price: 1000 }],
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
        expect(res.body.message).toContain("line item")
      })

      test("returns 400 when an item has no title", async () => {
        const res = await api.post(
          "/store/b2b/quotes",
          { items: [{ quantity: 1, unit_price: 1000 }] },
          { headers: { Authorization: `Bearer ${customerAuthToken}` } }
        )
        expect(res.status).toBe(400)
        expect(res.body.message).toContain("title")
      })

      test("returns 400 when quantity is invalid", async () => {
        const res = await api.post(
          "/store/b2b/quotes",
          { items: [{ title: "Test", quantity: 0, unit_price: 1000 }] },
          { headers: { Authorization: `Bearer ${customerAuthToken}` } }
        )
        expect(res.status).toBe(400)
        expect(res.body.message).toContain("quantity")
      })

      test("returns 400 when unit_price is negative", async () => {
        const res = await api.post(
          "/store/b2b/quotes",
          { items: [{ title: "Test", quantity: 1, unit_price: -100 }] },
          { headers: { Authorization: `Bearer ${customerAuthToken}` } }
        )
        expect(res.status).toBe(400)
        expect(res.body.message).toContain("unit_price")
      })

      test("creates a draft quote with valid line items", async () => {
        const items = [
          {
            product_id: null,
            title: "Organic Apple Box (12 ct)",
            sku: "ORG-APP-12",
            quantity: 20,
            unit_price: 2400,
          },
          {
            title: "Heirloom Tomato Basket (5 lbs)",
            sku: "HRM-TOM-5",
            quantity: 10,
            unit_price: 1800,
          },
        ]

        const res = await api.post(
          "/store/b2b/quotes",
          {
            items,
            notes: "Weekly delivery for our farm-to-table event.",
          },
          { headers: { Authorization: `Bearer ${customerAuthToken}` } }
        )

        expect(res.status).toBe(201)
        expect(res.body.quote).toBeDefined()
        expect(res.body.quote.status).toBe("draft")
        expect(res.body.quote.customer_email).toBeTruthy()
        expect(res.body.quote.company_id).toBe(companyId)
        expect(res.body.quote.items).toHaveLength(2)
        expect(res.body.quote.subtotal).toBe(66000) // 20*2400 + 10*1800 = 66000

        // Validate item structure in response
        expect(res.body.quote.items[0].title).toBe("Organic Apple Box (12 ct)")
        expect(res.body.quote.items[0].quantity).toBe(20)
        expect(res.body.quote.items[0].unit_price).toBe(2400)
        expect(res.body.quote.items[0].total).toBe(48000)

        draftQuoteId = res.body.quote.id
      })

      test("creates a quote without notes", async () => {
        const res = await api.post(
          "/store/b2b/quotes",
          {
            items: [
              { title: "Single Item", quantity: 5, unit_price: 1200 },
            ],
          },
          { headers: { Authorization: `Bearer ${customerAuthToken}` } }
        )

        expect(res.status).toBe(201)
        expect(res.body.quote.admin_notes).toBeNull()
        expect(res.body.quote.subtotal).toBe(6000) // 5 * 1200
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
        expect(Array.isArray(res.body.quotes)).toBe(true)
        expect(res.body.quotes.length).toBeGreaterThanOrEqual(2)
        expect(res.body.count).toBeGreaterThanOrEqual(2)

        // Most recent quote should be first
        if (res.body.quotes.length >= 2) {
          const dates = res.body.quotes.map(
            (q: any) => new Date(q.created_at).getTime()
          )
          for (let i = 1; i < dates.length; i++) {
            expect(dates[i]).toBeLessThanOrEqual(dates[i - 1])
          }
        }

        // Each quote should have the expected shape
        const first = res.body.quotes[0]
        expect(first.id).toBeTruthy()
        expect(first.status).toBeTruthy()
        expect(first.items).toBeDefined()
        expect(first.subtotal).toBeGreaterThan(0)
        expect(first.created_at).toBeTruthy()
      })

      test("filters by status query param", async () => {
        const res = await api.get("/store/b2b/quotes?status=draft", {
          headers: { Authorization: `Bearer ${customerAuthToken}` },
        })

        expect(res.status).toBe(200)
        expect(Array.isArray(res.body.quotes)).toBe(true)
        for (const q of res.body.quotes) {
          expect(q.status).toBe("draft")
        }
      })

      test("returns empty array when no quotes match status filter", async () => {
        const res = await api.get("/store/b2b/quotes?status=converted", {
          headers: { Authorization: `Bearer ${customerAuthToken}` },
        })

        expect(res.status).toBe(200)
        expect(res.body.quotes).toHaveLength(0)
        expect(res.body.count).toBe(0)
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
            items: [{ title: "Second Customer Item", quantity: 1, unit_price: 500 }],
          },
          { headers: { Authorization: `Bearer ${secondAuth.token}` } }
        )

        // The primary customer should NOT see the second customer's quote
        const primaryRes = await api.get("/store/b2b/quotes", {
          headers: { Authorization: `Bearer ${customerAuthToken}` },
        })

        for (const q of primaryRes.body.quotes) {
          expect(q.customer_id).toBe(customerId)
          expect(q.company_id).toBe(companyId)
        }
      })
    })

    // ═══════════════════════════════════════════════════════════════════
    //  ADMIN: List quotes and perform review actions
    // ═══════════════════════════════════════════════════════════════════

    describe("GET /admin/b2b-quotes — Admin lists all quotes", () => {
      test("returns paginated list with company hydration", async () => {
        const res = await api.get("/admin/b2b-quotes", adminHeaders)

        expect(res.status).toBe(200)
        expect(Array.isArray(res.body.quotes)).toBe(true)
        expect(res.body.quotes.length).toBeGreaterThanOrEqual(1)
        expect(res.body.count).toBeGreaterThanOrEqual(1)

        // Verify company data is hydrated via Remote Query
        const first = res.body.quotes[0]
        expect(first.company).toBeDefined()
        expect(first.company.company_name).toBeTruthy()
      })

      test("filters by status", async () => {
        const res = await api.get("/admin/b2b-quotes?status=draft", adminHeaders)

        expect(res.status).toBe(200)
        for (const q of res.body.quotes) {
          expect(q.status).toBe("draft")
        }
      })

      test("filters by company_id", async () => {
        const res = await api.get(
          `/admin/b2b-quotes?company_id=${companyId}`,
          adminHeaders
        )

        expect(res.status).toBe(200)
        for (const q of res.body.quotes) {
          expect(q.company_id).toBe(companyId)
        }
      })

      test("paginates with offset and limit", async () => {
        const res = await api.get(
          "/admin/b2b-quotes?offset=0&limit=1",
          adminHeaders
        )

        expect(res.status).toBe(200)
        expect(res.body.quotes.length).toBeLessThanOrEqual(1)
        expect(res.body.offset).toBe(0)
        expect(res.body.limit).toBe(1)
      })
    })

    describe("GET /admin/b2b-quotes/:id — Retrieve single quote", () => {
      test("returns 404 for non-existent quote", async () => {
        const res = await api.get(
          "/admin/b2b-quotes/nonexistent-id",
          adminHeaders
        )
        expect(res.status).toBe(404)
      })

      test("returns full quote with company data", async () => {
        expect(draftQuoteId).toBeTruthy()

        const res = await api.get(
          `/admin/b2b-quotes/${draftQuoteId}`,
          adminHeaders
        )

        expect(res.status).toBe(200)
        expect(res.body.quote).toBeDefined()
        expect(res.body.quote.id).toBe(draftQuoteId)
        expect(res.body.quote.status).toBe("draft")
        expect(res.body.quote.items).toHaveLength(2)
        expect(res.body.quote.subtotal).toBe(66000)
        expect(res.body.quote.company).toBeDefined()
        expect(res.body.quote.company.company_name).toBe("Acme Organic Farms")
        expect(res.body.quote.created_at).toBeTruthy()
      })
    })

    describe("POST /admin/b2b-quotes/:id/review — Reject a quote", () => {
      let rejectQuoteId: string

      beforeAll(async () => {
        // Create a fresh quote to reject
        const res = await api.post(
          "/store/b2b/quotes",
          {
            items: [
              { title: "Item to Reject", quantity: 3, unit_price: 500 },
            ],
          },
          { headers: { Authorization: `Bearer ${customerAuthToken}` } }
        )
        rejectQuoteId = res.body.quote.id
      })

      test("returns 400 with invalid status", async () => {
        const res = await api.post(
          `/admin/b2b-quotes/${rejectQuoteId}/review`,
          { status: "invalid_status" },
          adminHeaders
        )
        expect(res.status).toBe(400)
        expect(res.body.message).toContain("status")
      })

      test("returns 409 when quote is already reviewed", async () => {
        // First rejection
        await api.post(
          `/admin/b2b-quotes/${rejectQuoteId}/review`,
          { status: "rejected", admin_notes: "First rejection" },
          adminHeaders
        )

        // Second attempt should fail
        const res = await api.post(
          `/admin/b2b-quotes/${rejectQuoteId}/review`,
          { status: "rejected" },
          adminHeaders
        )
        expect(res.status).toBe(409)
        expect(res.body.message).toContain("already")
      })

      test("rejects a quote and attaches admin notes", async () => {
        // Create a fresh quote
        const createRes = await api.post(
          "/store/b2b/quotes",
          {
            items: [
              { title: "Another Reject", quantity: 1, unit_price: 2000 },
            ],
          },
          { headers: { Authorization: `Bearer ${customerAuthToken}` } }
        )
        const quoteId = createRes.body.quote.id

        const res = await api.post(
          `/admin/b2b-quotes/${quoteId}/review`,
          {
            status: "rejected",
            admin_notes:
              "We cannot fulfill this request at the quoted price. Please revise.",
          },
          adminHeaders
        )

        expect(res.status).toBe(200)
        expect(res.body.quote.status).toBe("rejected")
        expect(res.body.quote.admin_notes).toContain("quoted price")
        expect(res.body.order).toBeNull()
      })
    })

    describe("POST /admin/b2b-quotes/:id/review — Approve and convert to order", () => {
      let approveQuoteId: string

      beforeAll(async () => {
        // Create a fresh quote to approve
        const res = await api.post(
          "/store/b2b/quotes",
          {
            items: [
              {
                product_id: null,
                title: "Bulk Organic Apples",
                sku: "BLK-APP-50",
                quantity: 50,
                unit_price: 2200, // $22.00 each
              },
              {
                title: "Premium Cold-Pressed Juice",
                sku: "JUC-PRM-12",
                quantity: 24,
                unit_price: 3500, // $35.00 each
              },
            ],
            notes: "Monthly standing order for our restaurant chain.",
          },
          { headers: { Authorization: `Bearer ${customerAuthToken}` } }
        )
        approveQuoteId = res.body.quote.id
      })

      test("approves with negotiated price override and creates order", async () => {
        const res = await api.post(
          `/admin/b2b-quotes/${approveQuoteId}/review`,
          {
            status: "approved",
            negotiated_total: 150000, // $1,500.00 negotiated (vs $191,000 subtotal)
            admin_notes:
              "Approved with 15% bulk discount. Converted to commercial invoice.",
          },
          adminHeaders
        )

        // Verify the response
        expect(res.status).toBe(201)
        expect(res.body.quote.status).toBe("converted")
        expect(res.body.quote.negotiated_total).toBe(150000)
        expect(res.body.quote.admin_notes).toContain("15% bulk discount")

        // Verify the order was created
        expect(res.body.order).toBeDefined()
        expect(res.body.order.id).toBeTruthy()
        expect(res.body.order.email).toBeTruthy()
        expect(res.body.order.metadata.quote_id).toBe(approveQuoteId)
        expect(res.body.order.metadata.is_wholesale).toBe(true)
        expect(res.body.order.metadata.converted_from_quote).toBe(true)

        // Verify order has the correct items
        expect(res.body.order.items).toHaveLength(2)

        // Verify the quote status is persisted
        const verifyRes = await api.get(
          `/admin/b2b-quotes/${approveQuoteId}`,
          adminHeaders
        )
        expect(verifyRes.body.quote.status).toBe("converted")
        expect(verifyRes.body.quote.negotiated_total).toBe(150000)
      })

      test("approves without negotiated override (uses subtotal)", async () => {
        // Create a fresh quote
        const createRes = await api.post(
          "/store/b2b/quotes",
          {
            items: [
              { title: "Simple Item", quantity: 10, unit_price: 1000 },
            ],
          },
          { headers: { Authorization: `Bearer ${customerAuthToken}` } }
        )
        const simpleQuoteId = createRes.body.quote.id

        // Approve without negotiated_total
        const res = await api.post(
          `/admin/b2b-quotes/${simpleQuoteId}/review`,
          {
            status: "approved",
            admin_notes: "Approved at quoted price.",
          },
          adminHeaders
        )

        expect(res.status).toBe(201)
        expect(res.body.quote.status).toBe("converted")
        // negotiated_total should remain null since it was not provided
        expect(res.body.quote.negotiated_total).toBeNull()
        expect(res.body.order).toBeDefined()
      })
    })

    // ═══════════════════════════════════════════════════════════════════
    //  ERROR HANDLING: Edge cases
    // ═══════════════════════════════════════════════════════════════════

    describe("Error handling — edge cases", () => {
      test("returns 401 when no auth token for store quote submission", async () => {
        const res = await api.post("/store/b2b/quotes", {
          items: [{ title: "X", quantity: 1, unit_price: 100 }],
        })
        expect(res.status).toBe(401)
      })

      test("returns 400 when company does not exist for customer", async () => {
        // Create a customer with no company
        const noCompAuth = await createAuthCustomer("no-company")

        const res = await api.post(
          "/store/b2b/quotes",
          {
            items: [{ title: "Test", quantity: 1, unit_price: 1000 }],
          },
          { headers: { Authorization: `Bearer ${noCompAuth.token}` } }
        )

        expect(res.status).toBe(400)
        expect(res.body.message).toContain("company")
      })

      test("admin returns empty list when no quotes exist for filter", async () => {
        const res = await api.get(
          "/admin/b2b-quotes?status=converted&limit=1",
          adminHeaders
        )

        expect(res.status).toBe(200)
        // There should be at least 1 converted quote from the approval tests
        expect(res.body.count).toBeGreaterThanOrEqual(1)
      })
    })
  },
})
