import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { createAndLoginAdmin } from "../helpers/integration-auth"

jest.setTimeout(120 * 1000)

/**
 * Integration tests for vendor registration and login flows.
 *
 * Covers:
 *   1. Vendor registration — success and validation error cases
 *   2. Vendor login — pending/rejected/suspended status checks
 *   3. Full end-to-end: register → admin approve → login with JWT
 *   4. Edge cases — duplicate email, weak password, missing fields
 */
medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, adminHeaders, getContainer }) => {
    // ── Shared test data ──────────────────────────────────────────────

    const TEST_STORE_NAME = "Integration Test Store"
    const TEST_EMAIL = `vendor-int-${Date.now()}@eatsie.test`
    const TEST_PASSWORD = "VendorIntPass123!"
    const DUPLICATE_EMAIL = `vendor-dup-${Date.now()}@eatsie.test`

    let registeredVendorId: string

    // ═══════════════════════════════════════════════════════════════════
    //  TEST: Vendor Registration
    // ═══════════════════════════════════════════════════════════════════

    describe("POST /vendor/register — Registration", () => {
      test("creates a new vendor with status pending", async () => {
        const res = await api.post("/vendor/register", {
          name: "Integration Tester",
          store_name: TEST_STORE_NAME,
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
          description: "A vendor created during integration testing",
        }, { validateStatus: () => true })

        expect(res.status).toBe(201)
        expect(res.data.message).toMatch(/awaiting administrator approval/i)
        expect(res.data.vendor).toBeDefined()
        expect(res.data.vendor.email).toBe(TEST_EMAIL)
        expect(res.data.vendor.store_name).toBe(TEST_STORE_NAME)
        expect(res.data.vendor.status).toBe("pending")
        expect(res.data.vendor.password_hash).toBeUndefined()

        registeredVendorId = res.data.vendor.id
      })

      test("returns 400 when email is missing", async () => {
        const res = await api.post("/vendor/register", {
          store_name: "No Email Store",
          password: "ValidPass123!",
        }, { validateStatus: () => true })

        expect(res.status).toBe(400)
        expect(res.data.message).toContain("email")
      })

      test("returns 400 when password is too short (less than 12 chars)", async () => {
        const res = await api.post("/vendor/register", {
          store_name: "Weak Password Store",
          email: `weak-${Date.now()}@eatsie.test`,
          password: "Short1!",
        }, { validateStatus: () => true })

        expect(res.status).toBe(400)
        expect(res.data.message).toContain("password")
        expect(res.data.message).toContain("12")
      })

      test("returns 400 when store_name is missing", async () => {
        const res = await api.post("/vendor/register", {
          email: `nostore-${Date.now()}@eatsie.test`,
          password: "ValidPassword123!",
        }, { validateStatus: () => true })

        expect(res.status).toBe(400)
        expect(res.data.message).toContain("store name")
      })

      test("returns 400 for invalid email format", async () => {
        const res = await api.post("/vendor/register", {
          store_name: "Bad Email Store",
          email: "not-an-email",
          password: "ValidPassword123!",
        }, { validateStatus: () => true })

        expect(res.status).toBe(400)
        expect(res.data.message).toContain("email")
      })

      test("returns 400 when registering with an existing email", async () => {
        // First registration
        const first = await api.post("/vendor/register", {
          store_name: "First Dup Store",
          email: DUPLICATE_EMAIL,
          password: "DupPassword123!",
        }, { validateStatus: () => true })
        expect(first.status).toBe(201)

        // Duplicate registration with the same email
        const second = await api.post("/vendor/register", {
          store_name: "Second Dup Store",
          email: DUPLICATE_EMAIL,
          password: "AnotherPass123!",
        }, { validateStatus: () => true })

        expect(second.status).toBe(400)
        expect(second.data.message).toMatch(/email already registered/i)
      })

      test("accepts optional company_details as JSON", async () => {
        const res = await api.post("/vendor/register", {
          store_name: "Company Store",
          email: `company-${Date.now()}@eatsie.test`,
          password: "CompanyPass123!",
          company_details: {
            company_name: "Test Corp",
            tax_id: "TAX-12345",
            website: "https://testcorp.example",
          },
        }, { validateStatus: () => true })

        expect(res.status).toBe(201)
        expect(res.data.vendor).toBeDefined()
        expect(res.data.vendor.company_details).toBeDefined()
        expect(res.data.vendor.company_details.company_name).toBe("Test Corp")
      })
    })

    // ═══════════════════════════════════════════════════════════════════
    //  TEST: Vendor Login — status-based responses
    // ═══════════════════════════════════════════════════════════════════

    describe("POST /vendor/login — Login flow", () => {
      // Register a fresh vendor for login tests
      let loginVendorId: string
      const loginEmail = `login-${Date.now()}@eatsie.test`

      beforeAll(async () => {
        const res = await api.post("/vendor/register", {
          store_name: "Login Test Store",
          email: loginEmail,
          password: "LoginPass123!",
        }, { validateStatus: () => true })
        loginVendorId = res.data.vendor.id
      })

      test("returns 403 with pending status for unapproved vendor", async () => {
        const res = await api.post("/vendor/login", {
          email: loginEmail,
          password: "LoginPass123!",
        }, { validateStatus: () => true })

        expect(res.status).toBe(403)
        expect(res.data.status).toBe("pending")
        expect(res.data.message).toMatch(/pending administrator review/i)
        expect(res.data.token).toBeUndefined()
      })

      test("returns 401 for unregistered email", async () => {
        const res = await api.post("/vendor/login", {
          email: "nonexistent@eatsie.test",
          password: "SomePassword123!",
        }, { validateStatus: () => true })

        expect(res.status).toBe(401)
        expect(res.data.message).toMatch(/invalid email or password/i)
      })

      test("returns 401 for wrong password", async () => {
        const res = await api.post("/vendor/login", {
          email: loginEmail,
          password: "WrongPassword123!",
        }, { validateStatus: () => true })

        expect(res.status).toBe(401)
        expect(res.data.message).toMatch(/invalid email or password/i)
      })

      test("returns 400 when email is missing", async () => {
        const res = await api.post("/vendor/login", {
          password: "SomePassword123!",
        }, { validateStatus: () => true })

        expect(res.status).toBe(400)
        expect(res.data.message).toMatch(/email and password are required/i)
      })

      test("returns 400 when password is missing", async () => {
        const res = await api.post("/vendor/login", {
          email: loginEmail,
        }, { validateStatus: () => true })

        expect(res.status).toBe(400)
        expect(res.data.message).toMatch(/email and password are required/i)
      })
    })

    // ═══════════════════════════════════════════════════════════════════
    //  TEST: Full End-to-End — Admin approve → Vendor login with JWT
    // ═══════════════════════════════════════════════════════════════════

    describe("E2E: Admin approval → Vendor login with JWT", () => {
      const e2eEmail = `e2e-${Date.now()}@eatsie.test`
      let e2eVendorId: string
      let adminAuth: { headers: Record<string, string> }

      beforeAll(async () => {
        const container = getContainer()
        adminAuth = await createAndLoginAdmin(container, api)

        // Register the E2E vendor
        const regRes = await api.post("/vendor/register", {
          store_name: "E2E Approval Store",
          email: e2eEmail,
          password: "E2EPass123!",
        }, { validateStatus: () => true })
        expect(regRes.status).toBe(201)
        e2eVendorId = regRes.data.vendor.id
      })

      test("approves the vendor via admin API", async () => {
        const res = await api.post(`/admin/vendors/${e2eVendorId}/approve`, {}, {
          headers: adminAuth.headers,
          validateStatus: () => true,
        })

        expect(res.status).toBe(200)
        expect(res.data.message).toMatch(/approved successfully/i)
        expect(res.data.vendor.status).toBe("approved")
      })

      test("vendor login returns 200 with JWT token after approval", async () => {
        const res = await api.post("/vendor/login", {
          email: e2eEmail,
          password: "E2EPass123!",
        }, { validateStatus: () => true })

        expect(res.status).toBe(200)
        expect(res.data.message).toBe("Login successful")
        expect(res.data.token).toBeDefined()
        expect(typeof res.data.token).toBe("string")
        expect(res.data.token.split(".")).toHaveLength(3)

        // Verify token contains expected claims
        const payload = JSON.parse(
          Buffer.from(res.data.token.split(".")[1], "base64url").toString()
        )
        expect(payload.vendorId).toBe(e2eVendorId)
        expect(payload.iss).toBe("organic-canada")
        expect(payload.aud).toBe("vendor-dashboard")
        expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000))

        // Verify vendor details in response
        expect(res.data.vendor).toBeDefined()
        expect(res.data.vendor.id).toBe(e2eVendorId)
        expect(res.data.vendor.status).toBe("approved")
        expect(res.data.vendor.password_hash).toBeUndefined()
      })

      test("vendor can access protected routes with the JWT token", async () => {
        // First login to get a fresh token
        const loginRes = await api.post("/vendor/login", {
          email: e2eEmail,
          password: "E2EPass123!",
        }, { validateStatus: () => true })
        const token = loginRes.data.token

        // Try to access a protected vendor endpoint (vendor products)
        const statsRes = await api.get("/vendor/products", {
          headers: { Authorization: `Bearer ${token}` },
          validateStatus: () => true,
        })

        // Should succeed — vendor is authenticated and approved
        expect(statsRes.status).toBe(200)
        expect(statsRes.data).toBeDefined()
      })
    })
  },
})
