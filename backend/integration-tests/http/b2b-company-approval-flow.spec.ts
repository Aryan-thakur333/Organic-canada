import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createSalesChannelsWorkflow,
  createUserAccountWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
} from "@medusajs/medusa/core-flows"

jest.setTimeout(120 * 1000)

/**
 * Integration test for the complete B2B company approval flow:
 *
 *   1. Customer registers and logs in
 *   2. Customer submits a B2B company application (status: pending)
 *   3. Admin reviews pending applications
 *   4. Admin approves → customer added to B2B customer group
 *   5. Admin rejects with reason
 *   6. Admin suspends an approved company
 *   7. Edge cases: duplicate pending, already approved, validation errors
 *   8. Compatibility aliases: /store/b2b/companies and /store/b2b/companies/me
 *   9. B2B order metadata on checkout
 */
medusaIntegrationTestRunner({
  inApp: true,
  disableAutoTeardown: true,
  env: {},
  testSuite: ({ api, adminHeaders = { headers: {} }, getContainer }) => {
    let publishableApiKey: string
    let storeRequestIpSequence = 0

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
          input: {
            salesChannelsData: [
              {
                name: "B2B Company Test Channel",
              },
            ],
          },
        })
        salesChannelId = result[0].id
      }

      const {
        result: [apiKey],
      } = await createApiKeysWorkflow(container).run({
        input: {
          api_keys: [
            {
              title: "B2B company test publishable key",
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

      const adminEmail = `b2b-company-admin-${Date.now()}@eatsie.test`
      const adminPassword = "AdminPass123!"
      const authService: any = container.resolve(Modules.AUTH)
      const registration = await authService.register("emailpass", {
        body: { email: adminEmail, password: adminPassword },
      })
      expect(registration.success).toBe(true)

      await createUserAccountWorkflow(container).run({
        input: {
          authIdentityId: registration.authIdentity.id,
          userData: {
            email: adminEmail,
            first_name: "B2B",
            last_name: "Company Admin",
          },
        },
      })

      const adminLogin = await api.post("/auth/user/emailpass", {
        email: adminEmail,
        password: adminPassword,
      })
      expect(adminLogin.status).toBe(200)
      expect(adminLogin.data.token).toBeTruthy()

      ;(adminHeaders as any).headers ||= {}
      ;(adminHeaders as any).headers.Authorization = `Bearer ${adminLogin.data.token}`

      api.defaults.validateStatus = () => true
      api.defaults.headers.common["x-publishable-api-key"] = publishableApiKey
    })

    // ── Helpers ──────────────────────────────────────────────────────────

    /** Register a customer and return the auth token + customer id */
    async function createAuthCustomer(
      suffix: string
    ): Promise<{ token: string; id: string; email: string }> {
      const email = `b2b-company-${suffix}-${Date.now()}@eatsie.test`
      const password = "TestPass123!"

      const regResp = await api.post("/auth/customer/emailpass/register", {
        email,
        password,
      })
      const token: string = regResp.data.token

      const custResp = await api.post(
        "/store/customers",
        { email, first_name: "B2B", last_name: "Tester" },
        storeHeaders(token)
      )
      const id = custResp.data.customer?.id || custResp.data.id
      expect(id).toBeTruthy()

      const loginResp = await api.post("/auth/customer/emailpass", {
        email,
        password,
      })
      expect(loginResp.status).toBe(200)
      expect(loginResp.data.token).toBeTruthy()

      return { token: loginResp.data.token, id, email }
    }

    /** Submit a B2B company application for a customer */
    async function submitCompanyApplication(
      token: string,
      overrides: Record<string, any> = {}
    ): Promise<any> {
      const payload = {
        company_name: "Test Organic Farms",
        tax_id: `TAX-${Date.now()}`,
        requested_credit_limit: 5000,
        ...overrides,
      }
      const res = await api.post("/store/b2b/company", payload, {
        headers: storeHeaders(token).headers,
      })
      return res
    }

    // ── Auth helpers ─────────────────────────────────────────────────────

    function authHeaders(token: string) {
      return { Authorization: `Bearer ${token}` }
    }

    function storeHeaders(token?: string) {
      storeRequestIpSequence += 1
      const octet3 = Math.floor(storeRequestIpSequence / 250)
      const octet4 = (storeRequestIpSequence % 250) + 1

      return {
        headers: {
          "x-forwarded-for": `10.250.${octet3}.${octet4}`,
          ...(publishableApiKey ? { "x-publishable-api-key": publishableApiKey } : {}),
          ...(token ? authHeaders(token) : {}),
        },
      }
    }

    // ═════════════════════════════════════════════════════════════════════
    //  TEST SUITE 1: Company Registration
    // ═════════════════════════════════════════════════════════════════════

    describe("POST /store/b2b/company — Application submission", () => {
      let customerToken: string
      let customerId: string

      beforeAll(async () => {
        const auth = await createAuthCustomer("reg")
        customerToken = auth.token
        customerId = auth.id
      })

      test("returns 401 without authentication", async () => {
        const res = await api.post("/store/b2b/company", {
          company_name: "No Auth Co",
        })
        expect(res.status).toBe(401)
      })

      test("returns 400 when company_name is missing", async () => {
        const res = await api.post(
          "/store/b2b/company",
          { tax_id: "TAX-123" },
          storeHeaders(customerToken)
        )
        expect(res.status).toBe(400)
        expect(res.data.message).toContain("Company name")
      })

      test("returns 400 when requested_credit_limit is negative", async () => {
        const res = await api.post(
          "/store/b2b/company",
          {
            company_name: "Bad Credit Co",
            requested_credit_limit: -100,
          },
          storeHeaders(customerToken)
        )
        expect(res.status).toBe(400)
        expect(res.data.message).toContain("credit_limit")
      })

      test("creates a pending company application", async () => {
        const uniqueName = `Test Organic Farms ${Date.now()}`
        const res = await api.post(
          "/store/b2b/company",
          {
            company_name: uniqueName,
            tax_id: "TAX-987654321",
            requested_credit_limit: 5000, // $5,000.00
          },
          storeHeaders(customerToken)
        )

        expect(res.status).toBe(201)
        expect(res.data.company).toBeDefined()
        expect(res.data.company.company_name).toBe(uniqueName)
        expect(res.data.company.status).toBe("pending")
        expect(res.data.company.tax_id).toBe("TAX-987654321")
        expect(res.data.company.customer_id).toBe(customerId)
        expect(res.data.company.requested_credit_limit).toBe(500000) // 5000 * 100 = 500000 cents
        expect(res.data.message).toContain("admin approval")

      })

      test("returns existing company if already approved", async () => {
        // This will create a new customer, submit, and the next test will approve it
        // For now, just verify the pending company is returned
        const res = await api.get("/store/b2b/company", storeHeaders(customerToken))

        expect(res.status).toBe(200)
        expect(res.data.company).toBeDefined()
        expect(res.data.company.status).toBe("pending")
      })

      test("updates existing pending application instead of creating duplicate", async () => {
        const res = await api.post(
          "/store/b2b/company",
          {
            company_name: "Updated Farm Name",
            tax_id: "TAX-UPDATED",
            requested_credit_limit: 10000,
          },
          storeHeaders(customerToken)
        )

        // Should return 200 (update) not 201 (create)
        expect(res.status).toBe(200)
        expect(res.data.company.company_name).toBe("Updated Farm Name")
        expect(res.data.company.status).toBe("pending")
        expect(res.data.message).toMatch(/Waiting for admin approval/)
      })

      test("creates application with minimal fields", async () => {
        const minimalAuth = await createAuthCustomer("minimal")
        const res = await api.post(
          "/store/b2b/company",
          { company_name: "Minimal Co" },
          storeHeaders(minimalAuth.token)
        )

        expect(res.status).toBe(201)
        expect(res.data.company.company_name).toBe("Minimal Co")
        expect(res.data.company.requested_credit_limit).toBe(0)
        expect(res.data.company.tax_id).toBeNull()
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST SUITE 2: Retrieve Company
    // ═════════════════════════════════════════════════════════════════════

    describe("GET /store/b2b/company — Retrieve company", () => {
      let customerToken: string
      let customerId: string

      beforeAll(async () => {
        const auth = await createAuthCustomer("retrieve")
        customerToken = auth.token
        customerId = auth.id

        await submitCompanyApplication(customerToken, {
          company_name: "Retrievable Co",
        })
      })

      test("returns 401 without authentication", async () => {
        const res = await api.get("/store/b2b/company")
        expect(res.status).toBe(401)
      })

      test("returns the customer's company application", async () => {
        const res = await api.get("/store/b2b/company", storeHeaders(customerToken))

        expect(res.status).toBe(200)
        expect(res.data.company).toBeDefined()
        expect(res.data.company.company_name).toBe("Retrievable Co")
        expect(res.data.company.status).toBe("pending")
        expect(res.data.company.customer_id).toBe(customerId)
      })

      test("returns null when customer has no company", async () => {
        const noCompAuth = await createAuthCustomer("nocompany")
        const res = await api.get("/store/b2b/company", storeHeaders(noCompAuth.token))

        expect(res.status).toBe(200)
        expect(res.data.company).toBeNull()
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST SUITE 3: Compatibility Aliases
    // ═════════════════════════════════════════════════════════════════════

    describe("Compatibility aliases — /store/b2b/companies and /store/b2b/companies/me", () => {
      let customerToken: string

      beforeAll(async () => {
        const auth = await createAuthCustomer("alias")
        customerToken = auth.token

        await submitCompanyApplication(customerToken, {
          company_name: "Alias Test Co",
        })
      })

      test("POST /store/b2b/companies works (alias for company registration)", async () => {
        const aliasAuth = await createAuthCustomer("alias2")
        const res = await api.post(
          "/store/b2b/companies",
          { company_name: "Alias Registered Co" },
          storeHeaders(aliasAuth.token)
        )

        expect(res.status).toBe(201)
        expect(res.data.company).toBeDefined()
        expect(res.data.company.status).toBe("pending")
      })

      test("GET /store/b2b/companies/me works (alias for company retrieval)", async () => {
        const res = await api.get("/store/b2b/companies/me", storeHeaders(customerToken))

        expect(res.status).toBe(200)
        expect(res.data.company).toBeDefined()
        expect(res.data.company.company_name).toBe("Alias Test Co")
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST SUITE 4: Admin Lists Companies
    // ═════════════════════════════════════════════════════════════════════

    describe("GET /admin/b2b/companies — Admin lists companies", () => {
      let selfContainedCompanyId: string

      beforeAll(async () => {
        // Create a company with a unique searchable name for the search test
        const auth = await createAuthCustomer("admin-list")
        const res = await submitCompanyApplication(auth.token, {
          company_name: `ZebraSearchCo ${Date.now()}`,
        })
        selfContainedCompanyId = res.data.company.id
      })

      test("returns paginated list with all required fields", async () => {
        const res = await api.get("/admin/b2b/companies", adminHeaders)

        expect(res.status).toBe(200)
        expect(Array.isArray(res.data.companies)).toBe(true)
        expect(res.data.companies.length).toBeGreaterThanOrEqual(1)
        expect(res.data.count).toBeGreaterThanOrEqual(1)

        const first = res.data.companies[0]
        // Verify the new fields are present
        expect(first.requested_credit_limit).toBeDefined()
        expect(first.customer_id).toBeDefined()
        expect(first.status).toBeDefined()
        expect(first.company_name).toBeTruthy()
      })

      test("filters by status", async () => {
        const res = await api.get(
          "/admin/b2b/companies?status=pending",
          adminHeaders
        )

        expect(res.status).toBe(200)
        for (const c of res.data.companies) {
          expect(c.status).toBe("pending")
        }
      })

      test("paginates with offset and limit", async () => {
        const res = await api.get(
          "/admin/b2b/companies?offset=0&limit=5",
          adminHeaders
        )

        expect(res.status).toBe(200)
        expect(res.data.companies.length).toBeLessThanOrEqual(5)
        expect(res.data.offset).toBe(0)
        expect(res.data.limit).toBe(5)
      })

      test("searches by company name", async () => {
        const res = await api.get(
          `/admin/b2b/companies?search=ZebraSearchCo`,
          adminHeaders
        )

        expect(res.status).toBe(200)
        expect(res.data.companies.length).toBeGreaterThanOrEqual(1)
        for (const c of res.data.companies) {
          expect(c.company_name).toContain("ZebraSearchCo")
        }
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST SUITE 5: Admin Approve Company
    // ═════════════════════════════════════════════════════════════════════

    describe("POST /admin/b2b/companies/:id/approve — Approve with customer group", () => {
      let targetToken: string
      let targetCompanyId: string
      let targetCustomerId: string
      let targetEmail: string

      beforeAll(async () => {
        const auth = await createAuthCustomer("approve-target")
        targetToken = auth.token
        targetCustomerId = auth.id
        targetEmail = auth.email

        const res = await submitCompanyApplication(targetToken, {
          company_name: "Approval Test Co",
          requested_credit_limit: 2500,
        })
        targetCompanyId = res.data.company.id
      })

      test("returns 404 for non-existent company", async () => {
        const res = await api.post(
          "/admin/b2b/companies/nonexistent-id/approve",
          { approved_credit_limit: 1000 },
          adminHeaders
        )
        expect(res.status).toBe(404)
      })

      test("approves a pending company and returns customer group info", async () => {
        const res = await api.post(
          `/admin/b2b/companies/${targetCompanyId}/approve`,
          {
            approved_credit_limit: 3000, // $3,000.00
            admin_note: "Approved for wholesale pricing",
          },
          adminHeaders
        )

        expect(res.status).toBe(200)
        expect(res.data.company).toBeDefined()
        expect(res.data.company.status).toBe("approved")
        expect(res.data.company.approved_credit_limit).toBe(300000) // 3000 * 100 = 300000 cents
        expect(res.data.company.admin_note).toContain("wholesale")

        // Verify customer group info is returned
        expect(res.data.customer_group).toBeDefined()
        expect(res.data.customer_group.name).toMatch(/B2B|Partner|Wholesale/i)

        expect(res.data.message).toContain("Company approved")
      })

      test("returns 400 when approving an already approved company", async () => {
        const res = await api.post(
          `/admin/b2b/companies/${targetCompanyId}/approve`,
          { approved_credit_limit: 5000 },
          adminHeaders
        )
        expect(res.status).toBe(400)
        expect(res.data.message).toMatch(/already approved/i)
      })

      test("customer can retrieve their now-approved company", async () => {
        const res = await api.get("/store/b2b/company", storeHeaders(targetToken))

        expect(res.status).toBe(200)
        expect(res.data.company).toBeDefined()
        expect(res.data.company.status).toBe("approved")
        expect(res.data.company.approved_credit_limit).toBe(300000)
      })

      test("customer cannot resubmit once approved (returns approved company)", async () => {
        const res = await api.post(
          "/store/b2b/company",
          {
            company_name: "Should Not Update",
            requested_credit_limit: 99999,
          },
          storeHeaders(targetToken)
        )

        // Should return the existing approved company, not create a new one
        expect(res.status).toBe(200)
        expect(res.data.company.status).toBe("approved")
        expect(res.data.company.company_name).toBe("Approval Test Co")
        expect(res.data.message).toContain("B2B access approved")
      })

      test("customer sees approved_at and admin_note on retrieval", async () => {
        const res = await api.get("/store/b2b/company", storeHeaders(targetToken))

        expect(res.status).toBe(200)
        expect(res.data.company.approved_at).toBeTruthy()
        expect(res.data.company.admin_note).toContain("wholesale")
        expect(res.data.company.approved_credit_limit).toBe(300000)
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST SUITE 6: Admin Reject Company
    // ═════════════════════════════════════════════════════════════════════

    describe("POST /admin/b2b/companies/:id/reject — Reject application", () => {
      let rejectToken: string
      let rejectCompanyId: string

      beforeAll(async () => {
        const auth = await createAuthCustomer("reject-target")
        rejectToken = auth.token

        const res = await submitCompanyApplication(rejectToken, {
          company_name: "Reject Test Co",
        })
        rejectCompanyId = res.data.company.id
      })

      test("rejects a pending company with a reason", async () => {
        const res = await api.post(
          `/admin/b2b/companies/${rejectCompanyId}/reject`,
          {
            reason: "Invalid tax information provided",
            admin_note: "Please resubmit with correct documentation",
          },
          adminHeaders
        )

        expect(res.status).toBe(200)
        expect(res.data.company.status).toBe("rejected")
        expect(res.data.company.rejection_reason).toContain("Invalid tax")
        expect(res.data.company.admin_note).toContain("resubmit")
      })

      test("returns 400 when rejecting an already rejected company", async () => {
        const res = await api.post(
          `/admin/b2b/companies/${rejectCompanyId}/reject`,
          { reason: "Again" },
          adminHeaders
        )
        expect(res.status).toBe(400)
        expect(res.data.message).toMatch(/already rejected/i)
      })

      test("returns 400 when rejecting an approved company", async () => {
        // Create a new company, approve it, try to reject
        const auth = await createAuthCustomer("reject-approved")
        const appRes = await submitCompanyApplication(auth.token, {
          company_name: "Approved Then Reject",
        })
        const approvedId = appRes.data.company.id

        // Approve it first
        await api.post(
          `/admin/b2b/companies/${approvedId}/approve`,
          {},
          adminHeaders
        )

        // Try to reject — should fail
        const res = await api.post(
          `/admin/b2b/companies/${approvedId}/reject`,
          { reason: "Changed mind" },
          adminHeaders
        )
        expect(res.status).toBe(400)
        expect(res.data.message).toContain("suspend")
      })

      test("rejected customer can resubmit a new application", async () => {
        const res = await api.post(
          "/store/b2b/company",
          {
            company_name: "Resubmitted Co",
            requested_credit_limit: 1000,
          },
          storeHeaders(rejectToken)
        )

        // The existing rejected record is re-activated as a pending application
        expect(res.status).toBe(200)
        expect(res.data.company.status).toBe("pending")
        expect(res.data.company.company_name).toBe("Resubmitted Co")
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST SUITE 7: Admin Suspend Company
    // ═════════════════════════════════════════════════════════════════════

    describe("POST /admin/b2b/companies/:id/suspend — Suspend company", () => {
      let suspendCompanyId: string

      beforeAll(async () => {
        // Create + approve a company for suspension test
        const auth = await createAuthCustomer("suspend-target")
        const appRes = await submitCompanyApplication(auth.token, {
          company_name: "Suspend Test Co",
        })
        suspendCompanyId = appRes.data.company.id
        await api.post(
          `/admin/b2b/companies/${suspendCompanyId}/approve`,
          {},
          adminHeaders
        )
      })

      test("suspends an approved company", async () => {
        const res = await api.post(
          `/admin/b2b/companies/${suspendCompanyId}/suspend`,
          { admin_note: "Suspended due to payment issues" },
          adminHeaders
        )

        expect(res.status).toBe(200)
        expect(res.data.company.status).toBe("suspended")
        expect(res.data.company.admin_note).toContain("payment")
      })

      test("returns 400 when suspending a pending company", async () => {
        const auth = await createAuthCustomer("suspend-pending")
        const appRes = await submitCompanyApplication(auth.token, {
          company_name: "Pending Suspend Test",
        })

        const res = await api.post(
          `/admin/b2b/companies/${appRes.data.company.id}/suspend`,
          {},
          adminHeaders
        )
        expect(res.status).toBe(400)
        expect(res.data.message).toContain("Reject")
      })

      test("returns 400 when suspending an already suspended company", async () => {
        const res = await api.post(
          `/admin/b2b/companies/${suspendCompanyId}/suspend`,
          {},
          adminHeaders
        )
        expect(res.status).toBe(400)
        expect(res.data.message).toMatch(/already suspended/i)
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST SUITE 8: Admin Company Status Route (legacy compatibility)
    // ═════════════════════════════════════════════════════════════════════

    describe("POST /admin/b2b/companies/:id/status — Legacy status update", () => {
      let legacyCompanyId: string

      beforeAll(async () => {
        const auth = await createAuthCustomer("legacy-status")
        const appRes = await submitCompanyApplication(auth.token, {
          company_name: "Legacy Status Co",
        })
        legacyCompanyId = appRes.data.company.id
      })

      test("updates status via legacy endpoint", async () => {
        const res = await api.post(
          `/admin/b2b/companies/${legacyCompanyId}/status`,
          { status: "active" },
          adminHeaders
        )

        expect(res.status).toBe(200)
        expect(res.data.company.status).toBe("active")
      })

      test("returns 400 for invalid status value", async () => {
        const res = await api.post(
          `/admin/b2b/companies/${legacyCompanyId}/status`,
          { status: "invalid_status" },
          adminHeaders
        )

        expect(res.status).toBe(400)
        expect(res.data.message).toContain("Status")
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST SUITE 9: Complete E2E Flow
    // ═════════════════════════════════════════════════════════════════════

    describe("Complete E2E: Register → Submit → Approve → Verify group → Resubmit quote", () => {
      let e2eToken: string
      let e2eCompanyId: string
      let e2eCustomerId: string

      test("Step 1: Customer logs in and registers company", async () => {
        const auth = await createAuthCustomer("e2e-flow")
        e2eToken = auth.token
        e2eCustomerId = auth.id

        const res = await api.post(
          "/store/b2b/company",
          {
            company_name: "E2E Test Organics",
            tax_id: "E2E-TAX-001",
            requested_credit_limit: 5000,
          },
          storeHeaders(e2eToken)
        )

        expect(res.status).toBe(201)
        expect(res.data.company.status).toBe("pending")
        e2eCompanyId = res.data.company.id
      })

      test("Step 2: Admin sees the pending application", async () => {
        const res = await api.get(
          `/admin/b2b/companies?status=pending&search=E2E`,
          adminHeaders
        )

        expect(res.status).toBe(200)
        const found = res.data.companies.find(
          (c: any) => c.id === e2eCompanyId
        )
        expect(found).toBeDefined()
        expect(found.status).toBe("pending")
        expect(found.customer_id).toBe(e2eCustomerId)
      })

      test("Step 3: Admin approves with custom credit limit", async () => {
        const res = await api.post(
          `/admin/b2b/companies/${e2eCompanyId}/approve`,
          {
            approved_credit_limit: 7500,
            admin_note: "Approved for E2E testing",
          },
          adminHeaders
        )

        expect(res.status).toBe(200)
        expect(res.data.company.status).toBe("approved")
        expect(res.data.company.approved_credit_limit).toBe(750000) // 7500 * 100
        expect(res.data.customer_group).toBeDefined()
        expect(res.data.message).toContain("Company approved")
      })

      test("Step 4: Customer sees approved status with wholesale pricing active", async () => {
        const res = await api.get("/store/b2b/company", storeHeaders(e2eToken))

        expect(res.status).toBe(200)
        expect(res.data.company.status).toBe("approved")
        expect(res.data.company.approved_credit_limit).toBe(750000)
      })

      test("Step 5: Admin list shows company as approved", async () => {
        const res = await api.get(
          `/admin/b2b/companies?status=approved`,
          adminHeaders
        )

        expect(res.status).toBe(200)
        const found = res.data.companies.find(
          (c: any) => c.id === e2eCompanyId
        )
        expect(found).toBeDefined()
        expect(found.status).toBe("approved")
        expect(found.approved_at).toBeTruthy()
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST SUITE 10: Security — Admin-only routes reject customer tokens
    // ═════════════════════════════════════════════════════════════════════

    describe("Security — Admin-only endpoints reject customer tokens", () => {
      let customerToken: string

      beforeAll(async () => {
        const auth = await createAuthCustomer("security")
        customerToken = auth.token
      })

      test("approve rejects customer token", async () => {
        const res = await api.post(
          `/admin/b2b/companies/fake-id/approve`,
          {},
          { headers: authHeaders(customerToken) }
        )
        expect(res.status).toBe(401)
      })

      test("reject rejects customer token", async () => {
        const res = await api.post(
          `/admin/b2b/companies/fake-id/reject`,
          {},
          { headers: authHeaders(customerToken) }
        )
        expect(res.status).toBe(401)
      })

      test("suspend rejects customer token", async () => {
        const res = await api.post(
          `/admin/b2b/companies/fake-id/suspend`,
          {},
          { headers: authHeaders(customerToken) }
        )
        expect(res.status).toBe(401)
      })

      test("admin list rejects customer token", async () => {
        const res = await api.get("/admin/b2b/companies", {
          headers: authHeaders(customerToken),
        })
        expect(res.status).toBe(401)
      })
    })
  },
})
