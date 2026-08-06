import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createUserAccountWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows"
import { B2B_MODULE } from "../../src/modules/b2b"
import { COMMISSION_MODULE } from "../../src/modules/commission"

jest.setTimeout(120 * 1000)

medusaIntegrationTestRunner({
  inApp: true,
  disableAutoTeardown: true,
  env: {},
  testSuite: ({ api, adminHeaders, getContainer }) => {
    // ── Shared state ────────────────────────────────────────────────────
    let customerAuthToken: string
    let adminAuthToken: string
    let customerId: string
    let companyId: string
    let manualQuoteId: string
    let draftQuoteId: string
    let rejectableQuoteId: string
    let customerRejectedQuoteId: string
    let testVariantId: string
    let testProductId: string
    let secondVariantId: string
    let secondProductId: string
    let publishableApiKey: string
    let testRegionId: string
    let testSalesChannelId: string

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
      return {
        Authorization: `Bearer ${token}`,
      }
    }

    function storeHeaders(token?: string) {
      return withDefaults(token ? authHeaders(token) : {})
    }

    function adminOptions(headers: Record<string, string> = {}) {
      return {
        validateStatus: () => true,
        headers: {
          ...(adminAuthToken ? authHeaders(adminAuthToken) : ((adminHeaders as any)?.headers || adminHeaders || {})),
          ...headers,
        },
      }
    }

    async function retrieveOrderSnapshot(orderId: string) {
      const query: any = getContainer().resolve("query")
      const { data } = await query.graph({
        entity: "order",
        fields: [
          "id",
          "email",
          "customer_id",
          "payment_status",
          "fulfillment_status",
          "currency_code",
          "region_id",
          "sales_channel_id",
          "subtotal",
          "total",
          "discount_total",
          "item_subtotal",
          "item_total",
          "summary",
          "metadata",
          "shipping_address.*",
          "items.id",
          "items.title",
          "items.subtitle",
          "items.product_id",
          "items.product_title",
          "items.variant_id",
          "items.variant_title",
          "items.variant_sku",
          "items.quantity",
          "items.unit_price",
          "items.discount_total",
          "items.total",
          "items.adjustments.id",
          "items.adjustments.code",
          "items.adjustments.amount",
          "items.adjustments.description",
          "items.detail.quantity",
          "items.detail.unit_price",
          "items.metadata",
          "payment_collections.id",
          "payment_collections.status",
          "payment_collections.amount",
          "payment_collections.currency_code",
          "payment_collections.payments.id",
          "payment_collections.payments.amount",
          "payment_collections.payments.captured_at",
          "payment_collections.payments.status",
          "fulfillments.id",
          "fulfillments.shipped_at",
          "fulfillments.delivered_at",
        ],
        filters: { id: orderId },
      })

      return data?.[0]
    }

    function orderDisplayTotal(order: any) {
      return Number(
        order?.summary?.current_order_total ??
        order?.total ??
        order?.metadata?.negotiated_total ??
        0
      )
    }

    async function setB2BCustomerCommission(feeValue: number, isActive = true) {
      const commissionService: any = getContainer().resolve(COMMISSION_MODULE)
      const settings = await commissionService.listCommissionSettings(
        { account_type: "b2b_customer" },
        { take: 1 }
      )

      if (settings?.[0]) {
        return await commissionService.updateCommissionSettings({
          id: settings[0].id,
          fee_type: "percentage",
          fee_value: feeValue,
          is_active: isActive,
        })
      }

      return await commissionService.createCommissionSettings({
        account_type: "b2b_customer",
        fee_type: "percentage",
        fee_value: feeValue,
        is_active: isActive,
      })
    }

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
      }, withDefaults())
      const token: string = regResp.data.token

      // Create the customer record
      const custResp = await api.post(
        "/store/customers",
        { email, first_name: "B2B", last_name: "Tester" },
        storeHeaders(token)
      )
      const id = custResp.data.customer?.id || custResp.data.id
      expect(id).toBeTruthy()

      const loginResp = await api.post(
        "/auth/customer/emailpass",
        { email, password },
        withDefaults()
      )
      expect(loginResp.status).toBe(200)
      expect(loginResp.data.token).toBeTruthy()

      return { token: loginResp.data.token, id }
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
        storeHeaders(token)
      )

      expect(res.status).toBe(201)
      expect(res.data.company).toBeDefined()
      expect(res.data.company.company_name).toBe(name)
      expect(res.data.company.id).toBeTruthy()

      const companyId = res.data.company.id
      const b2bService: any = getContainer().resolve(B2B_MODULE)
      const approved = await b2bService.updateCompanies({
        id: companyId,
        status: "approved",
        approved_credit_limit: 100000,
        approved_at: new Date(),
        admin_note: "Auto-approved for quote integration tests",
      })

      expect(approved.status).toBe("approved")

      return companyId
    }

    // ═══════════════════════════════════════════════════════════════════
    //  SETUP: Create test products, customer, and company
    // ═══════════════════════════════════════════════════════════════════
    beforeAll(async () => {
      // Create test products with variants via the Medusa container
      const container = getContainer()
      const query: any = container.resolve("query")

      await setB2BCustomerCommission(0, true)

      const { data: salesChannels } = await query.graph({
        entity: "sales_channel",
        fields: ["id"],
        pagination: { take: 1 },
      })

      let { data: regions } = await query.graph({
        entity: "region",
        fields: ["id", "currency_code"],
        filters: { currency_code: "cad" },
        pagination: { take: 1 },
      })
      if (!regions?.[0]?.id) {
        const { result } = await createRegionsWorkflow(container).run({
          input: {
            regions: [
              {
                name: "Canada",
                currency_code: "cad",
                countries: ["ca"],
                payment_providers: ["pp_system_default"],
              },
            ],
          },
        })
        regions = result
      }
      testRegionId = regions?.[0]?.id
      expect(testRegionId).toBeTruthy()

      let salesChannelId = salesChannels?.[0]?.id
      if (!salesChannelId) {
        const { result } = await createSalesChannelsWorkflow(container).run({
          input: {
            salesChannelsData: [
              {
                name: "B2B Quote Test Channel",
              },
            ],
          },
        })
        salesChannelId = result[0].id
      }
      testSalesChannelId = salesChannelId

      const {
        result: [apiKey],
      } = await createApiKeysWorkflow(container).run({
        input: {
          api_keys: [
            {
              title: "B2B quote test publishable key",
              type: "publishable",
              created_by: "",
            },
          ],
        },
      })

      publishableApiKey = apiKey.token

      await linkSalesChannelsToApiKeyWorkflow(container).run({
        input: {
          id: apiKey.id,
          add: [salesChannelId],
        },
      })

      const { result: [product1] } = await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              title: "Organic Apple Box (12 ct)",
              status: "published" as any,
              sales_channels: [{ id: salesChannelId }],
              options: [{ title: "Package", values: ["Box"] }],
              variants: [
                {
                  title: "Default Variant",
                  sku: "ORG-APP-12",
                  allow_backorder: true,
                  options: { Package: "Box" },
                  prices: [
                    { amount: 2400, currency_code: "cad" },
                  ],
                },
              ],
            } as any,
          ],
        },
      })
      testProductId = product1.id
      testVariantId = product1.variants[0].id

      const { result: [product2] } = await createProductsWorkflow(container).run({
        input: {
          products: [
            {
              title: "Heirloom Tomato Basket (5 lbs)",
              status: "published" as any,
              sales_channels: [{ id: salesChannelId }],
              options: [{ title: "Package", values: ["Basket"] }],
              variants: [
                {
                  title: "Default Variant",
                  sku: "HRM-TOM-5",
                  allow_backorder: true,
                  options: { Package: "Basket" },
                  prices: [
                    { amount: 1800, currency_code: "cad" },
                  ],
                },
              ],
            } as any,
          ],
        },
      })
      secondProductId = product2.id
      secondVariantId = product2.variants[0].id

      // Create authenticated customer and company
      const auth = await createAuthCustomer("primary")
      customerAuthToken = auth.token
      customerId = auth.id

      companyId = await createCompany(customerAuthToken, "Acme Organic Farms")

      const adminEmail = `b2b-quote-admin-${Date.now()}@eatsie.test`
      const adminPassword = "AdminPass123!"
      const authService: any = container.resolve(Modules.AUTH)
      const registration = await authService.register("emailpass", {
        body: { email: adminEmail, password: adminPassword },
      })
      expect(registration.success).toBe(true)
      expect(registration.authIdentity?.id).toBeTruthy()

      await createUserAccountWorkflow(container).run({
        input: {
          authIdentityId: registration.authIdentity.id,
          userData: {
            email: adminEmail,
            first_name: "B2B",
            last_name: "Quote Admin",
          },
        },
      })

      const adminLogin = await api.post(
        "/auth/user/emailpass",
        { email: adminEmail, password: adminPassword },
        withDefaults()
      )
      expect(adminLogin.status).toBe(200)
      expect(adminLogin.data.token).toBeTruthy()
      adminAuthToken = adminLogin.data.token
    })

    // ═══════════════════════════════════════════════════════════════════
    //  STORE: Submit and list quotes
    // ═══════════════════════════════════════════════════════════════════

    describe("POST /store/b2b/quotes — Submit draft quote", () => {
      test("returns 401 without authentication", async () => {
        const res = await api.post(
          "/store/b2b/quotes",
          {
            items: [{ product_id: testProductId, variant_id: testVariantId, quantity: 1 }],
          },
          storeHeaders()
        )
        expect(res.status).toBe(401)
      })

      test("returns 400 when items array is empty", async () => {
        const res = await api.post(
          "/store/b2b/quotes",
          { items: [] },
          storeHeaders(customerAuthToken)
        )
        expect(res.status).toBe(400)
        expect(res.data.message).toContain("item")
      })

      test("creates a manual quote item when variant_id is missing", async () => {
        const res = await api.post(
          "/store/b2b/quotes",
          {
            items: [
              {
                title: "Manual organic catering bundle",
                sku: null,
                quantity: 3,
                unit_price: 12.5,
              },
            ],
            currency_code: "cad",
          },
          storeHeaders(customerAuthToken)
        )
        expect(res.status).toBe(201)
        expect(res.data.quote.status).toBe("pending_merchant")
        expect(res.data.quote.requested_items).toHaveLength(1)
        expect(res.data.quote.requested_items[0].variant_id).toBeNull()
        expect(res.data.quote.requested_items[0].unit_price).toBe(1250)
        expect(res.data.quote.requested_total).toBe(3750)

        manualQuoteId = res.data.quote.id
      })

      test("returns 400 when a manual quote item is missing price", async () => {
        const res = await api.post(
          "/store/b2b/quotes",
          {
            items: [
              {
                title: "Manual organic catering bundle",
                quantity: 3,
              },
            ],
            currency_code: "cad",
          },
          storeHeaders(customerAuthToken)
        )
        expect(res.status).toBe(400)
        expect(res.data.message).toContain("price")
      })

      test("returns 400 when quantity is invalid", async () => {
        const res = await api.post(
          "/store/b2b/quotes",
          { items: [{ product_id: testProductId, variant_id: testVariantId, quantity: 0 }] },
          storeHeaders(customerAuthToken)
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
            region_id: testRegionId,
          },
          storeHeaders(customerAuthToken)
        )

        expect(res.status).toBe(201)
        expect(res.data.quote).toBeDefined()
        expect(res.data.quote.status).toBe("pending_merchant")
        expect(res.data.quote.company_id).toBe(companyId)
        expect(res.data.quote.requested_items).toHaveLength(2)
        expect(res.data.quote.requested_items[0].unit_price).toBe(2400)
        expect(res.data.quote.requested_items[0].original_unit_price).toBe(2400)
        expect(res.data.quote.requested_items[1].unit_price).toBe(1800)
        expect(res.data.quote.requested_items[1].original_unit_price).toBe(1800)
        expect(res.data.quote.requested_total).toBe(66000)
        expect(res.data.quote.original_total).toBe(66000)
        expect(res.data.quote.negotiated_total).toBe(66000)

        draftQuoteId = res.data.quote.id
      })

      test("real catalog variant snapshots CAD regional price and preserves identity", async () => {
        const { result: [auditProduct] } = await createProductsWorkflow(getContainer()).run({
          input: {
            products: [
              {
                title: "Audit Test Product 2",
                status: "published" as any,
                sales_channels: [{ id: testSalesChannelId }],
                options: [{ title: "Default", values: ["Default"] }],
                variants: [
                  {
                    title: "Default Variant",
                    sku: "AUDIT-TEST-2-CAD",
                    allow_backorder: true,
                    options: { Default: "Default" },
                    prices: [
                      { amount: 9, currency_code: "cad" },
                      { amount: 4, currency_code: "usd" },
                    ],
                  },
                ],
              } as any,
            ],
          },
        })

        const variant = auditProduct.variants[0]
        const res = await api.post(
          "/store/b2b/quotes",
          {
            items: [
              {
                source_type: "variant",
                product_id: auditProduct.id,
                variant_id: variant.id,
                quantity: 25,
                displayed_unit_price_minor: 9,
              },
            ],
            currency_code: "cad",
            region_id: testRegionId,
            sales_channel_id: testSalesChannelId,
          },
          storeHeaders(customerAuthToken)
        )

        expect(res.status).toBe(201)
        expect(res.data.quote.currency_code).toBe("cad")
        expect(res.data.quote.region_id).toBe(testRegionId)
        expect(res.data.quote.sales_channel_id).toBe(testSalesChannelId)
        expect(res.data.quote.original_total).toBe(225)
        expect(res.data.quote.negotiated_total).toBe(225)
        expect(res.data.quote.items).toHaveLength(1)
        expect(res.data.quote.items[0].source_type).toBe("variant")
        expect(res.data.quote.items[0].variant_id).toBe(variant.id)
        expect(res.data.quote.items[0].product_id).toBe(auditProduct.id)
        expect(res.data.quote.items[0].sku).toBe("AUDIT-TEST-2-CAD")
        expect(res.data.quote.items[0].original_unit_price).toBe(9)
        expect(res.data.quote.items[0].requested_unit_price).toBe(9)
        expect(res.data.quote.items[0].original_line_total).toBe(225)

        const detail = await api.get(`/store/b2b/quotes/${res.data.quote.id}`, storeHeaders(customerAuthToken))
        expect(detail.status).toBe(200)
        expect(detail.data.quote.original_total).toBe(225)
        expect(detail.data.quote.items[0].variant_id).toBe(variant.id)
        expect(detail.data.quote.items[0].sku).toBe("AUDIT-TEST-2-CAD")
        expect(detail.data.quote.items[0].original_unit_price).toBe(9)
      })

      test("rejects malformed catalog rows instead of converting them to custom items", async () => {
        const res = await api.post(
          "/store/b2b/quotes",
          {
            items: [
              {
                source_type: "variant",
                title: "Audit Test Product 2",
                quantity: 25,
                unit_price: 0.09,
              },
            ],
            currency_code: "cad",
            region_id: testRegionId,
          },
          storeHeaders(customerAuthToken)
        )

        expect(res.status).toBe(400)
        expect(res.data.code).toBe("B2B_QUOTE_VARIANT_REQUIRED")
      })

      test("rejects an unpriced variant instead of creating a zero-price quote", async () => {
        const productModuleService: any = getContainer().resolve(Modules.PRODUCT)
        const [unpricedProduct] = await productModuleService.createProducts([
          {
            title: "Unpriced B2B Test Product",
            variants: [
              {
                title: "Default Variant",
                sku: `UNPRICED-B2B-${Date.now()}`,
              },
            ],
          },
        ])

        const res = await api.post(
          "/store/b2b/quotes",
          {
            items: [
              {
                product_id: unpricedProduct.id,
                variant_id: unpricedProduct.variants[0].id,
                quantity: 1,
              },
            ],
            currency_code: "cad",
            region_id: testRegionId,
          },
          storeHeaders(customerAuthToken)
        )

        expect(res.status).toBe(422)
        expect(res.data.code).toBe("B2B_QUOTE_PRICE_UNAVAILABLE")
        expect(res.data.message).toBe("Price is unavailable for this product in the selected market.")
        expect(res.data.details.variant_id).toBe(unpricedProduct.variants[0].id)
      })

      test("creates a quote without buyer_note", async () => {
        const res = await api.post(
          "/store/b2b/quotes",
          {
            items: [
              { product_id: testProductId, variant_id: testVariantId, quantity: 5 },
            ],
            currency_code: "cad",
            region_id: testRegionId,
          },
          storeHeaders(customerAuthToken)
        )

        expect(res.status).toBe(201)
        expect(res.data.quote.buyer_note).toBeNull()

        rejectableQuoteId = res.data.quote.id
      })
    })

    describe("Admin B2B quote management", () => {
      test("customer token cannot access admin quote endpoints", async () => {
        const res = await api.get("/admin/b2b-quotes", {
          validateStatus: () => true,
          headers: authHeaders(customerAuthToken),
        })

        expect([401, 403]).toContain(res.status)
      })

      test("admin list quotes returns submitted quote", async () => {
        const res = await api.get("/admin/b2b-quotes?status=pending_merchant", adminOptions())

        expect(res.status).toBe(200)
        expect(Array.isArray(res.data.quotes)).toBe(true)
        expect(res.data.quotes.some((quote: any) => quote.id === manualQuoteId)).toBe(true)
        expect(res.data.quotes[0]).toHaveProperty("item_count")
        expect(res.data.quotes[0]).toHaveProperty("total_units")
      })

      test("admin retrieve quote returns detail", async () => {
        const res = await api.get(`/admin/b2b-quotes/${manualQuoteId}`, adminOptions())

        expect(res.status).toBe(200)
        expect(res.data.quote.id).toBe(manualQuoteId)
        expect(res.data.quote.company_id).toBe(companyId)
        expect(res.data.quote.customer_id).toBe(customerId)
        expect(res.data.quote.items).toHaveLength(1)
        expect(res.data.quote.items[0].variant_id).toBeNull()
      })

      test("admin edit manual item recalculates totals", async () => {
        const detail = await api.get(`/admin/b2b-quotes/${manualQuoteId}`, adminOptions())
        expect(detail.status).toBe(200)
        const itemId = detail.data.quote.items[0].id

        const res = await api.patch(
          `/admin/b2b-quotes/${manualQuoteId}/items/${itemId}`,
          {
            quantity: 4,
            unit_price: 9.99,
          },
          adminOptions()
        )

        expect(res.status).toBe(200)
        expect(res.data.message).toBe("Quote item updated.")
        expect(res.data.quote.items[0].quantity).toBe(4)
        expect(res.data.quote.items[0].unit_price).toBe(999)
        expect(res.data.quote.items[0].line_total).toBe(3996)
        expect(res.data.quote.total).toBe(3996)
        expect(res.data.quote.items[0].metadata.modified_by_admin).toBe(true)
      })

      test("admin negotiated-total endpoint stores decimal input as minor units", async () => {
        const before = await api.get(`/admin/b2b-quotes/${manualQuoteId}`, adminOptions())
        expect(before.status).toBe(200)
        const beforeVersion = Number(before.data.quote.offer_version || 1)

        const res = await api.patch(
          `/admin/b2b-quotes/${manualQuoteId}/negotiated-total`,
          {
            negotiated_total: 39.96,
            payment_terms: "net_30",
            expires_at: "2026-12-31",
            admin_note: "Decimal final offer",
          },
          adminOptions()
        )

        expect(res.status).toBe(200)
        expect(res.data.quote.negotiated_total).toBe(3996)
        expect(res.data.quote.total).toBe(3996)
        expect(res.data.quote.original_total).toBeGreaterThan(0)
        expect(res.data.quote.payment_terms).toBe("net_30")
        expect(Number(res.data.quote.offer_version)).toBe(beforeVersion + 1)
        expect(res.data.quote.admin_note).toBe("Decimal final offer")
      })

      test("admin send offer changes status to pending_customer", async () => {
        const res = await api.post(
          `/admin/b2b-quotes/${manualQuoteId}/send`,
          { admin_note: "Wholesale counter-offer ready." },
          adminOptions()
        )

        expect(res.status).toBe(200)
        expect(res.data.message).toBe("Quote offer sent to customer.")
        expect(res.data.quote.status).toBe("pending_customer")
        expect(res.data.quote.admin_note).toBe("Wholesale counter-offer ready.")
        expect(res.data.quote.negotiated_total).toBe(3996)
        expect(res.data.quote.payment_terms).toBe("net_30")
        expect(res.data.quote.sent_at).toBeTruthy()
      })

      test("customer and admin quote messages persist and stay scoped", async () => {
        const customerMessage = await api.post(
          `/store/b2b/quotes/${manualQuoteId}/messages`,
          { message: "Can you confirm the bulk delivery window?" },
          storeHeaders(customerAuthToken)
        )
        expect(customerMessage.status).toBe(201)
        expect(customerMessage.data.message.sender_type).toBe("customer")
        expect(customerMessage.data.message.message).toBe("Can you confirm the bulk delivery window?")

        const adminMessagesBeforeReply = await api.get(
          `/admin/b2b-quotes/${manualQuoteId}/messages`,
          adminOptions()
        )
        expect(adminMessagesBeforeReply.status).toBe(200)
        expect(adminMessagesBeforeReply.data.messages.some((message: any) => message.is_system_message)).toBe(true)
        expect(adminMessagesBeforeReply.data.messages.some((message: any) => message.message === "Can you confirm the bulk delivery window?")).toBe(true)

        const adminReply = await api.post(
          `/admin/b2b-quotes/${manualQuoteId}/messages`,
          { message: "Yes, delivery can be scheduled for Tuesday morning." },
          adminOptions()
        )
        expect(adminReply.status).toBe(201)
        expect(adminReply.data.message.sender_type).toBe("admin")

        const customerMessages = await api.get(
          `/store/b2b/quotes/${manualQuoteId}/messages`,
          storeHeaders(customerAuthToken)
        )
        expect(customerMessages.status).toBe(200)
        expect(customerMessages.data.messages.map((message: any) => message.message)).toEqual(
          expect.arrayContaining([
            expect.stringContaining("Final offer sent:"),
            "Can you confirm the bulk delivery window?",
            "Yes, delivery can be scheduled for Tuesday morning.",
          ])
        )

        const secondAuth = await createAuthCustomer("message-owner-guard")
        await createCompany(secondAuth.token, "Message Guard Foods")
        const wrongCustomerMessages = await api.get(
          `/store/b2b/quotes/${manualQuoteId}/messages`,
          storeHeaders(secondAuth.token)
        )
        expect([403, 404]).toContain(wrongCustomerMessages.status)
      })

      test("admin reject quote changes status to merchant_rejected", async () => {
        const res = await api.post(
          `/admin/b2b-quotes/${rejectableQuoteId}/reject`,
          {
            reason: "Price cannot be approved",
            admin_note: "Rejected in integration test",
          },
          adminOptions()
        )

        expect(res.status).toBe(200)
        expect(res.data.message).toBe("Quote rejected successfully.")
        expect(res.data.quote.status).toBe("merchant_rejected")
        expect(res.data.quote.rejection_reason).toBe("Price cannot be approved")
      })

      test("rejected quote cannot be sent", async () => {
        const res = await api.post(
          `/admin/b2b-quotes/${rejectableQuoteId}/send`,
          {},
          adminOptions()
        )

        expect(res.status).toBe(400)
        expect(res.data.message).toContain("cannot be sent")
      })

      test("accepted quote cannot be edited or rejected", async () => {
        const b2bService: any = getContainer().resolve(B2B_MODULE)
        await b2bService.updateQuotes({
          id: draftQuoteId,
          status: "accepted",
          accepted_at: new Date(),
        })

        const detail = await api.get(`/admin/b2b-quotes/${draftQuoteId}`, adminOptions())
        expect(detail.status).toBe(200)
        const itemId = detail.data.quote.items[0].id

        const editRes = await api.patch(
          `/admin/b2b-quotes/${draftQuoteId}/items/${itemId}`,
          { quantity: 2 },
          adminOptions()
        )
        expect(editRes.status).toBe(400)
        expect(editRes.data.message).toContain("Only pending merchant quotes can be edited")

        const rejectRes = await api.post(
          `/admin/b2b-quotes/${draftQuoteId}/reject`,
          { reason: "Cannot approve" },
          adminOptions()
        )
        expect(rejectRes.status).toBe(400)
        expect(rejectRes.data.message).toContain("Accepted quotes cannot be rejected")
      })
    })

    describe("Customer B2B quote lifecycle", () => {
      test("customer can list pending customer quote with totals and items", async () => {
        const res = await api.get("/store/b2b/quotes?status=pending_customer", storeHeaders(customerAuthToken))

        expect(res.status).toBe(200)
        expect(Array.isArray(res.data.quotes)).toBe(true)
        const quote = res.data.quotes.find((q: any) => q.id === manualQuoteId)
        expect(quote).toBeTruthy()
        expect(quote.status).toBe("pending_customer")
        expect(quote.items).toHaveLength(1)
        expect(quote.item_count).toBe(1)
        expect(quote.total_units).toBe(4)
        expect(quote.total).toBe(3996)
        expect(quote.company_name).toBe("Acme Organic Farms")
        expect(quote.customer_email).toBeTruthy()
      })

      test("customer can retrieve quote detail", async () => {
        const res = await api.get(`/store/b2b/quotes/${manualQuoteId}`, storeHeaders(customerAuthToken))

        expect(res.status).toBe(200)
        expect(res.data.quote.id).toBe(manualQuoteId)
        expect(res.data.quote.status).toBe("pending_customer")
        expect(res.data.quote.items).toHaveLength(1)
        expect(res.data.quote.item_count).toBe(1)
        expect(res.data.quote.total).toBe(3996)
        expect(res.data.quote.company_name).toBe("Acme Organic Farms")
        expect(res.data.quote.customer_email).toBeTruthy()
      })

      test("customer cannot accept an expired offer", async () => {
        const createRes = await api.post(
          "/store/b2b/quotes",
          {
            items: [{ title: "Expired offer item", quantity: 1, unit_price: 10 }],
            currency_code: "cad",
          },
          storeHeaders(customerAuthToken)
        )
        expect(createRes.status).toBe(201)
        const quoteId = createRes.data.quote.id

        const saveRes = await api.patch(
          `/admin/b2b-quotes/${quoteId}/negotiated-total`,
          { negotiated_total: 10, expires_at: "2020-01-01" },
          adminOptions()
        )
        expect(saveRes.status).toBe(200)

        const sendRes = await api.post(`/admin/b2b-quotes/${quoteId}/send`, {}, adminOptions())
        expect(sendRes.status).toBe(200)

        const acceptRes = await api.post(
          `/store/b2b/quotes/${quoteId}/accept`,
          { offer_version: sendRes.data.quote.offer_version },
          storeHeaders(customerAuthToken)
        )
        expect(acceptRes.status).toBe(400)
        expect(acceptRes.data.message).toContain("expired")
      })

      test("customer cannot accept a stale offer version", async () => {
        const createRes = await api.post(
          "/store/b2b/quotes",
          {
            items: [{ title: "Stale offer item", quantity: 1, unit_price: 10 }],
            currency_code: "cad",
          },
          storeHeaders(customerAuthToken)
        )
        expect(createRes.status).toBe(201)
        const quoteId = createRes.data.quote.id

        const saveRes = await api.patch(
          `/admin/b2b-quotes/${quoteId}/negotiated-total`,
          { negotiated_total: 10 },
          adminOptions()
        )
        expect(saveRes.status).toBe(200)

        const sendRes = await api.post(`/admin/b2b-quotes/${quoteId}/send`, {}, adminOptions())
        expect(sendRes.status).toBe(200)

        const acceptRes = await api.post(
          `/store/b2b/quotes/${quoteId}/accept`,
          { offer_version: Number(sendRes.data.quote.offer_version) - 1 },
          storeHeaders(customerAuthToken)
        )
        expect(acceptRes.status).toBe(409)
        expect(acceptRes.data.message).toContain("changed")
      })

      test("customer can accept pending_customer quote and create a real order", async () => {
        const res = await api.post(
          `/store/b2b/quotes/${manualQuoteId}/accept`,
          { note: "Accepted by customer" },
          storeHeaders(customerAuthToken)
        )

        expect(res.status).toBe(200)
        expect(res.data.message).toBe("Quote accepted. Order created.")
        expect(res.data.quote.status).toBe("accepted")
        expect(res.data.quote.payment_state).toBe("payment_required")
        expect(res.data.quote.order_id || res.data.quote.created_order_id).toBeTruthy()
        expect(res.data.order?.id).toBeTruthy()
        expect(res.data.order.metadata.source).toBe("b2b_quote")
        expect(res.data.order.metadata.quote_id).toBe(manualQuoteId)
        expect(res.data.order.metadata.payment_state).toBe("payment_required")
        expect(res.data.order.metadata.settlement_mode).toBe("online")
        expect(res.data.order.metadata.company_id).toBe(companyId)
        expect(res.data.order.metadata.company_name).toBe("Acme Organic Farms")
        expect(res.data.order.metadata.customer_id).toBe(customerId)
        expect(res.data.order.metadata.b2b_customer).toBe(true)
        expect(res.data.order.metadata.customer_group_name).toBeTruthy()

        const orderService: any = getContainer().resolve(Modules.ORDER)
        const order = await orderService.retrieveOrder(res.data.order.id)
        expect(order.id).toBe(res.data.order.id)
        expect(order.customer_id).toBe(customerId)
        expect(order.metadata.quote_id).toBe(manualQuoteId)
        expect(order.metadata.negotiated_total).toBe(3996)
        expect(order.metadata.payment_state).toBe("payment_required")
        expect(order.metadata.settlement_mode).toBe("online")

        const orderSnapshot = await retrieveOrderSnapshot(res.data.order.id)
        expect(orderDisplayTotal(orderSnapshot)).toBe(3996)
        expect(orderSnapshot.metadata.source).toBe("b2b_quote")
        expect(orderSnapshot.metadata.payment_state).toBe("payment_required")
        expect(orderSnapshot.metadata.settlement_mode).toBe("online")
        expect(orderSnapshot.metadata.b2b_payment_required).toBe(true)
        expect(orderSnapshot.metadata.can_fulfill_before_payment).toBe(false)
        expect(orderSnapshot.metadata.company_id).toBe(companyId)
        expect(orderSnapshot.metadata.company_name).toBe("Acme Organic Farms")
        expect(orderSnapshot.metadata.b2b_customer).toBe(true)
        expect(orderSnapshot.metadata.customer_group_name).toBeTruthy()
        expect(orderSnapshot.fulfillments || []).toHaveLength(0)
        expect(orderSnapshot.payment_collections?.[0]?.amount).toBe(3996)
        expect(orderSnapshot.payment_collections?.[0]?.status).toBe("not_paid")
        expect(orderSnapshot.items).toHaveLength(1)
        expect(orderSnapshot.items[0].title).toBeTruthy()
        expect(orderSnapshot.items[0].metadata.sku).toBeTruthy()
        expect(orderSnapshot.items[0].metadata.manual_quote_item).toBe(true)
        expect(orderSnapshot.items[0].metadata.requires_allocation).toBe(false)

        const optionsRes = await api.get(
          `/store/b2b/quotes/${manualQuoteId}/payment-options`,
          storeHeaders(customerAuthToken)
        )
        expect(optionsRes.status).toBe(200)
        expect(optionsRes.data.quote.amount).toBe(3996)
        expect(optionsRes.data.quote.negotiated_total).toBe(3996)
        expect(optionsRes.data.providers.find((provider: any) => provider.id === "stripe")?.enabled).toBe(
          Boolean(process.env.STRIPE_API_KEY)
        )
        expect(optionsRes.data.providers.find((provider: any) => provider.id === "paypal")?.enabled).toBe(
          Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET)
        )
        expect(optionsRes.data.providers.find((provider: any) => provider.id === "invoice")?.enabled).toBe(true)

        const invoiceRes = await api.post(
          `/store/b2b/quotes/${manualQuoteId}/payments/invoice`,
          { reference: "INV-MANUAL-QUOTE" },
          storeHeaders(customerAuthToken)
        )
        expect(invoiceRes.status).toBe(200)
        expect(invoiceRes.data.payment_state).toBe("awaiting_remittance")

        const remittanceOrderSnapshot = await retrieveOrderSnapshot(res.data.order.id)
        expect(remittanceOrderSnapshot.metadata.payment_state).toBe("awaiting_remittance")
        expect(remittanceOrderSnapshot.metadata.settlement_mode).toBe("offline")

        const instructionsRes = await api.get(
          `/store/b2b/quotes/${manualQuoteId}/payment-instructions`,
          storeHeaders(customerAuthToken)
        )
        expect(instructionsRes.status).toBe(200)
        expect(instructionsRes.data.amount).toBe(3996)
        expect(instructionsRes.data.payment_state).toBe("awaiting_remittance")
        expect(instructionsRes.data.settlement_mode).toBe("offline")
        expect(instructionsRes.data.order_id).toBe(res.data.order.id)
        expect(instructionsRes.data.reference).toBeTruthy()
        expect(instructionsRes.data.instructions).toContain(instructionsRes.data.reference)

        const markPaidRes = await api.post(
          `/admin/b2b-quotes/${manualQuoteId}/mark-payment-received`,
          { payment_reference: "OFFLINE-MANUAL-QUOTE", note: "Wire received", amount_received: 39.96 },
          adminOptions()
        )
        expect(markPaidRes.status).toBe(200)
        expect(markPaidRes.data.quote.payment_state).toBe("paid")
        expect(markPaidRes.data.quote.paid_at).toBeTruthy()
        expect(markPaidRes.data.quote.metadata.payment_reference).toBe("OFFLINE-MANUAL-QUOTE")

        const paidOrderSnapshot = await retrieveOrderSnapshot(res.data.order.id)
        expect(paidOrderSnapshot.metadata.payment_state).toBe("paid")
        expect(paidOrderSnapshot.metadata.payment_reference).toBe("OFFLINE-MANUAL-QUOTE")
        expect(paidOrderSnapshot.metadata.settlement_mode).toBe("offline")
        expect(paidOrderSnapshot.payment_collections?.[0]?.amount).toBe(3996)
        expect(paidOrderSnapshot.payment_collections?.[0]?.payments?.[0]?.captured_at).toBeTruthy()
      })

      test("double accept does not create a duplicate order", async () => {
        const firstDetail = await api.get(`/store/b2b/quotes/${manualQuoteId}`, storeHeaders(customerAuthToken))
        const firstOrderId = firstDetail.data.quote.order_id || firstDetail.data.quote.created_order_id

        const res = await api.post(
          `/store/b2b/quotes/${manualQuoteId}/accept`,
          {},
          storeHeaders(customerAuthToken)
        )

        expect(res.status).toBe(200)
        expect(res.data.quote.status).toBe("accepted")
        expect(res.data.order.id).toBe(firstOrderId)
      })

      test("manual quote order keeps stored minor-unit price and allocation-safe item fields", async () => {
        const createRes = await api.post(
          "/store/b2b/quotes",
          {
            items: [
              {
                title: "Manual Test Item",
                sku: "MANUAL-TEST",
                quantity: 123,
                unit_price: 0.05,
              },
            ],
            currency_code: "cad",
          },
          storeHeaders(customerAuthToken)
        )
        expect(createRes.status).toBe(201)
        expect(createRes.data.quote.requested_items[0].unit_price).toBe(5)
        expect(createRes.data.quote.requested_total).toBe(615)

        const quoteId = createRes.data.quote.id
        const sendRes = await api.post(
          `/admin/b2b-quotes/${quoteId}/send`,
          { admin_note: "Tiny manual quote offer" },
          adminOptions()
        )
        expect(sendRes.status).toBe(200)

        const acceptRes = await api.post(
          `/store/b2b/quotes/${quoteId}/accept`,
          {},
          storeHeaders(customerAuthToken)
        )
        expect(acceptRes.status).toBe(200)

        const order = await retrieveOrderSnapshot(acceptRes.data.order.id)
        expect(orderDisplayTotal(order)).toBe(615)
        expect(order.metadata.source).toBe("b2b_quote")
        expect(order.metadata.quote_id).toBe(quoteId)
        expect(order.metadata.company_id).toBe(companyId)
        expect(order.metadata.company_name).toBe("Acme Organic Farms")
        expect(order.metadata.b2b_customer).toBe(true)
        expect(order.metadata.customer_group_name).toBeTruthy()
        expect(order.items).toHaveLength(1)
        expect(order.items[0].title).toBe("Manual Test Item")
        expect(order.items[0].metadata.sku).toBe("MANUAL-TEST")
        expect(Number(order.items[0].quantity)).toBe(123)
        expect(Number(order.items[0].unit_price)).toBe(5)
        expect(order.items[0].metadata.manual_quote_item).toBe(true)
        expect(order.items[0].metadata.requires_allocation).toBe(false)
      })

      test("accepted quote corrects line-total-as-unit-price snapshots before creating order", async () => {
        const createRes = await api.post(
          "/store/b2b/quotes",
          {
            items: [
              {
                title: "Organic Apples - Standard",
                sku: "ORG-APP-STD",
                quantity: 100,
                unit_price: 4.99,
              },
            ],
            currency_code: "cad",
          },
          storeHeaders(customerAuthToken)
        )
        expect(createRes.status).toBe(201)
        expect(createRes.data.quote.requested_items[0].unit_price).toBe(499)
        expect(createRes.data.quote.requested_total).toBe(49900)

        const quoteId = createRes.data.quote.id
        const b2bService: any = getContainer().resolve(B2B_MODULE)
        const quote = await b2bService.retrieveQuote(quoteId)
        const corruptedItems = quote.requested_items.map((item: any) => ({
          ...item,
          unit_price: 49900,
          requested_unit_price: 49900,
          negotiated_unit_price: 49900,
          current_calculated_unit_price: 49900,
          line_total: 49900,
          total: 49900,
        }))
        await b2bService.updateQuotes({
          id: quoteId,
          requested_items: corruptedItems,
          items: corruptedItems,
          negotiated_items: corruptedItems,
          original_total: 49900,
          negotiated_total: 49900,
          subtotal: 49900,
          total: 49900,
        })

        const sendRes = await api.post(
          `/admin/b2b-quotes/${quoteId}/send`,
          { admin_note: "Regression offer" },
          adminOptions()
        )
        expect(sendRes.status).toBe(200)

        const acceptRes = await api.post(
          `/store/b2b/quotes/${quoteId}/accept`,
          {},
          storeHeaders(customerAuthToken)
        )
        expect(acceptRes.status).toBe(200)

        const order = await retrieveOrderSnapshot(acceptRes.data.order.id)
        expect(orderDisplayTotal(order)).toBe(49900)
        expect(order.items).toHaveLength(1)
        expect(Number(order.items[0].quantity)).toBe(100)
        expect(Number(order.items[0].unit_price)).toBe(499)
        expect(Number(order.items[0].unit_price) * Number(order.items[0].quantity)).toBe(49900)
      })

      test("accepted variant quote uses negotiated price instead of product original price", async () => {
        const createRes = await api.post(
          "/store/b2b/quotes",
          {
            items: [
              {
                product_id: testProductId,
                variant_id: testVariantId,
                quantity: 123,
              },
            ],
            currency_code: "cad",
            region_id: testRegionId,
          },
          storeHeaders(customerAuthToken)
        )
        expect(createRes.status).toBe(201)
        expect(createRes.data.quote.requested_items[0].variant_id).toBe(testVariantId)

        const quoteId = createRes.data.quote.id
        const detail = await api.get(`/admin/b2b-quotes/${quoteId}`, adminOptions())
        expect(detail.status).toBe(200)
        const itemId = detail.data.quote.items[0].id

        const editRes = await api.patch(
          `/admin/b2b-quotes/${quoteId}/items/${itemId}`,
          {
            quantity: 123,
            unit_price: 0.05,
          },
          adminOptions()
        )
        expect(editRes.status).toBe(200)
        expect(editRes.data.quote.items[0].unit_price).toBe(5)
        expect(editRes.data.quote.total).toBe(615)

        const sendRes = await api.post(
          `/admin/b2b-quotes/${quoteId}/send`,
          { admin_note: "Negotiated variant quote offer" },
          adminOptions()
        )
        expect(sendRes.status).toBe(200)

        const missingAddressRes = await api.post(
          `/store/b2b/quotes/${quoteId}/accept`,
          {},
          storeHeaders(customerAuthToken)
        )
        expect(missingAddressRes.status).toBe(400)
        expect(missingAddressRes.data.message).toContain("shipping address")

        const acceptRes = await api.post(
          `/store/b2b/quotes/${quoteId}/accept`,
          {
            shipping_address: {
              first_name: "B2B",
              last_name: "Tester",
              address_1: "123 Orchard Lane",
              city: "Toronto",
              province: "ON",
              postal_code: "M5V 2T6",
              country_code: "ca",
            },
          },
          storeHeaders(customerAuthToken)
        )
        expect(acceptRes.status).toBe(200)

        const order = await retrieveOrderSnapshot(acceptRes.data.order.id)
        expect(orderDisplayTotal(order)).toBe(615)
        expect(order.shipping_address.address_1).toBe("123 Orchard Lane")
        expect(order.items).toHaveLength(1)
        expect(order.items[0].variant_id).toBe(testVariantId)
        expect(Number(order.items[0].quantity)).toBe(123)
        expect(Number(order.items[0].unit_price)).toBe(5)
        expect(order.items[0].metadata.sku).toBe("ORG-APP-12")
        expect(order.items[0].metadata.manual_quote_item).toBe(false)
        expect(order.items[0].metadata.requires_allocation).toBe(true)
      })

      test("admin structured item edit 6.49 to 6.40 drives final offer and accepted order amount", async () => {
        const createRes = await api.post(
          "/store/b2b/quotes",
          {
            items: [
              {
                title: "Organic Milk",
                sku: "EATSIE-ORGANIC-MILK",
                quantity: 100,
                unit_price: 6.49,
              },
            ],
            currency_code: "cad",
          },
          storeHeaders(customerAuthToken)
        )
        expect(createRes.status).toBe(201)
        expect(createRes.data.quote.requested_total).toBe(64900)

        const quoteId = createRes.data.quote.id
        const chatRes = await api.post(
          `/admin/b2b-quotes/${quoteId}/messages`,
          { message: "I will give you 640" },
          adminOptions()
        )
        expect(chatRes.status).toBe(201)

        const detail = await api.get(`/admin/b2b-quotes/${quoteId}`, adminOptions())
        expect(detail.status).toBe(200)
        const itemId = detail.data.quote.items[0].id

        const editRes = await api.patch(
          `/admin/b2b-quotes/${quoteId}/items/${itemId}`,
          {
            quantity: 100,
            unit_price: 6.4,
          },
          adminOptions()
        )
        expect(editRes.status).toBe(200)
        expect(editRes.data.quote.original_total).toBe(64900)
        expect(editRes.data.quote.negotiated_total).toBe(64000)
        expect(editRes.data.quote.quote_adjustment_total).toBe(-900)
        expect(editRes.data.quote.items[0].requested_unit_price).toBe(649)
        expect(editRes.data.quote.items[0].negotiated_unit_price).toBe(640)
        expect(editRes.data.quote.items[0].line_total).toBe(64000)

        const sendRes = await api.post(
          `/admin/b2b-quotes/${quoteId}/send`,
          { admin_note: "Structured milk offer ready." },
          adminOptions()
        )
        expect(sendRes.status).toBe(200)
        expect(sendRes.data.quote.status).toBe("pending_customer")
        expect(sendRes.data.quote.original_total).toBe(64900)
        expect(sendRes.data.quote.negotiated_total).toBe(64000)

        const customerDetail = await api.get(`/store/b2b/quotes/${quoteId}`, storeHeaders(customerAuthToken))
        expect(customerDetail.status).toBe(200)
        expect(customerDetail.data.quote.original_total).toBe(64900)
        expect(customerDetail.data.quote.negotiated_total).toBe(64000)
        expect(customerDetail.data.quote.items[0].requested_unit_price).toBe(649)
        expect(customerDetail.data.quote.items[0].negotiated_unit_price).toBe(640)

        const acceptRes = await api.post(
          `/store/b2b/quotes/${quoteId}/accept`,
          {},
          storeHeaders(customerAuthToken)
        )
        expect(acceptRes.status).toBe(200)

        const order = await retrieveOrderSnapshot(acceptRes.data.order.id)
        expect(orderDisplayTotal(order)).toBe(64000)
        expect(order.metadata.negotiated_total).toBe(64000)
        expect(order.payment_collections?.[0]?.amount).toBe(64000)
        expect(Number(order.items[0].quantity)).toBe(100)
        expect(Number(order.items[0].unit_price)).toBe(640)
      })

      test("b2b customer commission snapshots negotiated subtotal and final payable amount", async () => {
        await setB2BCustomerCommission(4, true)

        try {
          const createRes = await api.post(
            "/store/b2b/quotes",
            {
              items: [
                {
                  title: "Commission Snapshot Item",
                  sku: "B2B-COMMISSION-SNAPSHOT",
                  quantity: 1,
                  unit_price: 2.22,
                },
              ],
              currency_code: "cad",
            },
            storeHeaders(customerAuthToken)
          )
          expect(createRes.status).toBe(201)
          expect(createRes.data.quote.requested_total).toBe(222)

          const quoteId = createRes.data.quote.id
          const chatRes = await api.post(
            `/admin/b2b-quotes/${quoteId}/messages`,
            { message: "Chat only: final amount is 2.20" },
            adminOptions()
          )
          expect(chatRes.status).toBe(201)

          const sendRes = await api.post(
            `/admin/b2b-quotes/${quoteId}/send`,
            {
              negotiated_total: 2.2,
              admin_note: "Structured final offer is 2.20.",
            },
            adminOptions()
          )
          expect(sendRes.status).toBe(200)
          expect(sendRes.data.quote.original_total).toBe(222)
          expect(sendRes.data.quote.negotiated_total).toBe(220)
          expect(sendRes.data.quote.negotiated_subtotal).toBe(220)
          expect(sendRes.data.quote.commission_amount).toBe(9)
          expect(sendRes.data.quote.final_payable_total).toBe(229)
          expect(sendRes.data.quote.total).toBe(229)

          await setB2BCustomerCommission(8, true)

          const customerDetail = await api.get(`/store/b2b/quotes/${quoteId}`, storeHeaders(customerAuthToken))
          expect(customerDetail.status).toBe(200)
          expect(customerDetail.data.quote.negotiated_total).toBe(220)
          expect(customerDetail.data.quote.commission_amount).toBe(9)
          expect(customerDetail.data.quote.final_payable_total).toBe(229)
          expect(customerDetail.data.quote.total).toBe(229)

          const acceptRes = await api.post(
            `/store/b2b/quotes/${quoteId}/accept`,
            {},
            storeHeaders(customerAuthToken)
          )
          expect(acceptRes.status).toBe(200)

          const order = await retrieveOrderSnapshot(acceptRes.data.order.id)
          expect(order.metadata.negotiated_total).toBe(220)
          expect(order.metadata.negotiated_subtotal).toBe(220)
          expect(order.metadata.commission_amount).toBe(9)
          expect(order.metadata.final_payable_total).toBe(229)
          expect(order.payment_collections?.[0]?.amount).toBe(229)
          expect(order.items.some((item: any) => item.metadata?.is_platform_fee && Number(item.unit_price) === 9)).toBe(true)

          const commissionService: any = getContainer().resolve(COMMISSION_MODULE)
          const records = await commissionService.listCommissionRecords({
            order_id: order.id,
            account_type: "b2b_customer",
          })
          expect(records).toHaveLength(1)
          expect(Number(records[0].base_amount)).toBe(220)
          expect(Number(records[0].commission_amount)).toBe(9)
        } finally {
          await setB2BCustomerCommission(0, true)
        }
      })

      test("quote-level negotiated total preserves exact subtotal when per-unit cents cannot represent it", async () => {
        await setB2BCustomerCommission(4, true)

        try {
          const createRes = await api.post(
            "/store/b2b/quotes",
            {
              items: [
                {
                  title: "Fresh Bananas",
                  sku: "B2B-BANANAS-50",
                  quantity: 50,
                  unit_price: 0.02,
                },
              ],
              currency_code: "cad",
            },
            storeHeaders(customerAuthToken)
          )
          expect(createRes.status).toBe(201)
          expect(createRes.data.quote.requested_total).toBe(100)

          const quoteId = createRes.data.quote.id
          const chatRes = await api.post(
            `/admin/b2b-quotes/${quoteId}/messages`,
            { message: "I can do 0.90" },
            adminOptions()
          )
          expect(chatRes.status).toBe(201)

          const unchanged = await api.get(`/store/b2b/quotes/${quoteId}`, storeHeaders(customerAuthToken))
          expect(unchanged.status).toBe(200)
          expect(unchanged.data.quote.negotiated_total).toBe(100)
          expect(unchanged.data.quote.total).toBe(100)

          const saveRes = await api.patch(
            `/admin/b2b-quotes/${quoteId}/negotiated-total`,
            { negotiated_total: 0.9 },
            adminOptions()
          )
          expect(saveRes.status).toBe(200)
          expect(saveRes.data.quote.original_total).toBe(100)
          expect(saveRes.data.quote.negotiated_total).toBe(90)
          expect(saveRes.data.quote.negotiated_subtotal).toBe(90)
          expect(saveRes.data.quote.commission_amount).toBe(4)
          expect(saveRes.data.quote.final_payable_total).toBe(94)

          const sendRes = await api.post(
            `/admin/b2b-quotes/${quoteId}/send`,
            { admin_note: "Structured final offer saved." },
            adminOptions()
          )
          expect(sendRes.status).toBe(200)
          expect(sendRes.data.quote.negotiated_total).toBe(90)
          expect(sendRes.data.quote.commission_amount).toBe(4)
          expect(sendRes.data.quote.final_payable_total).toBe(94)

          const customerDetail = await api.get(`/store/b2b/quotes/${quoteId}`, storeHeaders(customerAuthToken))
          expect(customerDetail.status).toBe(200)
          expect(customerDetail.data.quote.original_total).toBe(100)
          expect(customerDetail.data.quote.negotiated_total).toBe(90)
          expect(customerDetail.data.quote.commission_amount).toBe(4)
          expect(customerDetail.data.quote.commission_value).toBe(4)
          expect(customerDetail.data.quote.final_payable_total).toBe(94)
          expect(customerDetail.data.quote.total).toBe(94)

          await setB2BCustomerCommission(9, true)

          const acceptRes = await api.post(
            `/store/b2b/quotes/${quoteId}/accept`,
            {},
            storeHeaders(customerAuthToken)
          )
          expect(acceptRes.status).toBe(200)

          const order = await retrieveOrderSnapshot(acceptRes.data.order.id)
          expect(order.metadata.negotiated_total).toBe(90)
          expect(order.metadata.negotiated_subtotal).toBe(90)
          expect(order.metadata.commission_amount).toBe(4)
          expect(order.metadata.final_payable_total).toBe(94)
          expect(order.metadata.quote_adjustment_total).toBe(-10)
          expect(Number(order.discount_total)).toBe(10)
          expect(Number(order.item_total)).toBe(94)
          expect(order.payment_collections?.[0]?.amount).toBe(94)
        } finally {
          await setB2BCustomerCommission(0, true)
        }
      })

      test("quote-level negotiated total preserves exact odd-quantity subtotal", async () => {
        const createRes = await api.post(
          "/store/b2b/quotes",
          {
            items: [
              {
                title: "Odd Quantity Case",
                sku: "B2B-ODD-3",
                quantity: 3,
                unit_price: 0.34,
              },
            ],
            currency_code: "cad",
          },
          storeHeaders(customerAuthToken)
        )
        expect(createRes.status).toBe(201)

        const quoteId = createRes.data.quote.id
        const saveRes = await api.patch(
          `/admin/b2b-quotes/${quoteId}/negotiated-total`,
          { negotiated_total: 0.95 },
          adminOptions()
        )
        expect(saveRes.status).toBe(200)
        expect(saveRes.data.quote.negotiated_total).toBe(95)
        expect(saveRes.data.quote.negotiated_subtotal).toBe(95)
        expect(saveRes.data.quote.total).toBe(95)

        const sendRes = await api.post(
          `/admin/b2b-quotes/${quoteId}/send`,
          {},
          adminOptions()
        )
        expect(sendRes.status).toBe(200)
        expect(sendRes.data.quote.negotiated_total).toBe(95)
      })

      test("customer can reject pending_customer quote", async () => {
        const createRes = await api.post(
          "/store/b2b/quotes",
          {
            items: [
              {
                title: "Customer reject lifecycle bundle",
                quantity: 2,
                unit_price: 7.25,
              },
            ],
            currency_code: "cad",
          },
          storeHeaders(customerAuthToken)
        )
        expect(createRes.status).toBe(201)
        customerRejectedQuoteId = createRes.data.quote.id

        const sendRes = await api.post(
          `/admin/b2b-quotes/${customerRejectedQuoteId}/send`,
          { admin_note: "Ready for customer rejection test" },
          adminOptions()
        )
        expect(sendRes.status).toBe(200)
        expect(sendRes.data.quote.status).toBe("pending_customer")

        const rejectRes = await api.post(
          `/store/b2b/quotes/${customerRejectedQuoteId}/reject`,
          { reason: "Too expensive" },
          storeHeaders(customerAuthToken)
        )

        expect(rejectRes.status).toBe(200)
        expect(rejectRes.data.message).toBe("Quote rejected.")
        expect(rejectRes.data.quote.status).toBe("customer_rejected")
        expect(rejectRes.data.quote.rejection_reason).toBe("Too expensive")
      })

      test("customer cannot accept merchant_rejected quote", async () => {
        const res = await api.post(
          `/store/b2b/quotes/${rejectableQuoteId}/accept`,
          {},
          storeHeaders(customerAuthToken)
        )

        expect(res.status).toBe(400)
        expect(res.data.message).toContain("Only pending_customer quotes can be accepted")
      })

      test("customer cannot accept customer_rejected quote", async () => {
        const res = await api.post(
          `/store/b2b/quotes/${customerRejectedQuoteId}/accept`,
          {},
          storeHeaders(customerAuthToken)
        )

        expect(res.status).toBe(400)
        expect(res.data.message).toContain("Only pending_customer quotes can be accepted")
      })

      test("customer cannot accept quote belonging to another customer/company", async () => {
        const secondAuth = await createAuthCustomer("quote-owner-guard")
        await createCompany(secondAuth.token, "Wrong Owner Foods")

        const res = await api.post(
          `/store/b2b/quotes/${manualQuoteId}/accept`,
          {},
          storeHeaders(secondAuth.token)
        )

        expect([403, 404]).toContain(res.status)
      })
    })

    describe("GET /store/b2b/quotes — Customer lists their quotes", () => {
      test("returns 401 without authentication", async () => {
        const res = await api.get("/store/b2b/quotes", storeHeaders())
        expect(res.status).toBe(401)
      })

      test("returns the customer's quotes, most recent first", async () => {
        const res = await api.get("/store/b2b/quotes", storeHeaders(customerAuthToken))

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
        const res = await api.get(
          "/store/b2b/quotes?status=pending_merchant",
          storeHeaders(customerAuthToken)
        )

        expect(res.status).toBe(200)
        expect(Array.isArray(res.data.quotes)).toBe(true)
        for (const q of res.data.quotes) {
          expect(q.status).toBe("pending_merchant")
        }
      })

      test("returns empty array when no quotes match status filter", async () => {
        const res = await api.get(
          "/store/b2b/quotes?status=converted_to_order",
          storeHeaders(customerAuthToken)
        )

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
            region_id: testRegionId,
          },
          storeHeaders(secondAuth.token)
        )

        // The primary customer should NOT see the second customer's quote
        const primaryRes = await api.get("/store/b2b/quotes", storeHeaders(customerAuthToken))

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
        const res = await api.post(
          "/store/b2b/quotes",
          {
            items: [{ product_id: testProductId, variant_id: testVariantId, quantity: 1 }],
          },
          storeHeaders()
        )
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
            region_id: testRegionId,
          },
          storeHeaders(noCompAuth.token)
        )

        expect(res.status).toBe(400)
        expect(res.data.message).toContain("company")
      })
    })
  },
})
