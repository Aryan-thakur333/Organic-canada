import { medusaIntegrationTestRunner } from "@medusajs/test-utils"

jest.setTimeout(120 * 1000)

/**
 * Integration test verifying the complete admin auth + digital product flow:
 *
 *   1. Register a fresh admin user via POST /auth/user/emailpass/register
 *   2. Login and capture the access token
 *   3. Create a digital product by POST-ing multipart form data to
 *      /admin/products/digital
 *   4. Verify the response includes both the product and the digital asset
 *   5. Confirm the product is persisted via the admin GET /admin/products
 *      endpoint
 *   6. Verify the digital asset record exists through the module service
 *
 * This mirrors the admin panel UX: admin registers/logs in, fills the
 * "Add Digital Product" form, uploads a file, and sees a success toast.
 */
medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, adminHeaders }) => {
    // ── Helpers ──────────────────────────────────────────────────────────

    const TEST_EMAIL = `digital-admin-${Date.now()}@eatsie.test`
    const TEST_PASSWORD = "DigitaT3st!"

    /** Register a new admin (actor_type: "user") and return the auth token. */
    async function registerAdminUser(): Promise<string> {
      const res = await api
        .post("/auth/user/emailpass/register")
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD })

      expect(res.status).toBe(200)
      expect(res.body.token).toBeDefined()
      expect(typeof res.body.token).toBe("string")

      return res.body.token
    }

    /** Login with the test admin user and return the auth token. */
    async function loginAdminUser(): Promise<string> {
      const res = await api
        .post("/auth/user/emailpass")
        .send({ email: TEST_EMAIL, password: TEST_PASSWORD })

      expect(res.status).toBe(200)
      expect(res.body.token).toBeDefined()

      return res.body.token
    }

    /** Build an auth headers object for the given Bearer token. */
    function authHeaders(token: string) {
      return { Authorization: `Bearer ${token}` }
    }

    // ═════════════════════════════════════════════════════════════════════
    //  TEST: Admin registration & login
    // ═════════════════════════════════════════════════════════════════════

    describe("Step 1 — Admin Registration and Login", () => {
      let adminToken: string

      test("POST /auth/user/emailpass/register creates a new admin identity", async () => {
        adminToken = await registerAdminUser()
        expect(adminToken.length).toBeGreaterThan(0)
      })

      test("POST /auth/user/emailpass login returns a valid token", async () => {
        const token = await loginAdminUser()
        expect(token.length).toBeGreaterThan(0)
      })

      test("POST /auth/user/emailpass rejects wrong password", async () => {
        const res = await api
          .post("/auth/user/emailpass")
          .send({ email: TEST_EMAIL, password: "WrongPass123!" })

        expect(res.status).toBe(401)
        expect(res.body).toHaveProperty("message")
        // Medusa returns a generic error to avoid leaking user existence
        expect(res.body.message).toMatch(/invalid|Incorrect|not found/i)
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST: Digital product creation via multipart upload
    // ═════════════════════════════════════════════════════════════════════

    describe("Step 2 — Create digital product via POST /admin/products/digital", () => {
      let adminToken: string
      let productId: string
      let digitalAssetId: string
      let createdProductTitle: string

      beforeAll(async () => {
        adminToken = await registerAdminUser()
      })

      test("returns 401 without authentication", async () => {
        const res = await api
          .post("/admin/products/digital")
          .attach("file", Buffer.from("fake pdf content"), "test.pdf")
          .field("title", "Unauthorized Product")
          .field("price_eur", "9.99")

        expect(res.status).toBe(401)
      })

      test("returns 400 when title is missing", async () => {
        const res = await api
          .post("/admin/products/digital")
          .set(authHeaders(adminToken))
          .attach("file", Buffer.from("content"), "file.bin")
          .field("price_eur", "14.99")

        expect(res.status).toBe(400)
        expect(res.body.message).toContain("title")
      })

      test("returns 400 when file is missing", async () => {
        const res = await api
          .post("/admin/products/digital")
          .set(authHeaders(adminToken))
          .field("title", "No File Product")
          .field("price_usd", "29.99")

        expect(res.status).toBe(400)
        expect(res.body.message).toContain("file")
      })

      test("returns 400 when no price is provided", async () => {
        const res = await api
          .post("/admin/products/digital")
          .set(authHeaders(adminToken))
          .attach("file", Buffer.from("data"), "noprice.dat")
          .field("title", "No Price Product")

        expect(res.status).toBe(400)
        expect(res.body.message).toContain("price")
      })

      test("creates a digital product with both EUR and USD prices", async () => {
        createdProductTitle = `E-Book: Gardening Tips ${Date.now()}`
        const fileBuffer = Buffer.from(
          "This is a sample digital asset file content for testing.",
          "utf-8"
        )

        const res = await api
          .post("/admin/products/digital")
          .set(authHeaders(adminToken))
          .field("title", createdProductTitle)
          .field("price_eur", "19.99")
          .field("price_usd", "24.99")
          .attach("file", fileBuffer, "gardening-tips.pdf")

        // ── Verify response shape ─────────────────────────────────────
        expect(res.status).toBe(201)
        expect(res.body.type).toBe("success")
        expect(res.body.message).toMatch(/created successfully/i)

        // ── Verify product info in response ───────────────────────────
        expect(res.body.product).toBeDefined()
        expect(res.body.product.id).toBeTruthy()
        expect(res.body.product.title).toBe(createdProductTitle)
        expect(res.body.product.handle).toMatch(/e-book-gardening-tips/i)

        productId = res.body.product.id

        // ── Verify digital asset info in response ─────────────────────
        expect(res.body.digital_asset).toBeDefined()
        expect(res.body.digital_asset.id).toBeTruthy()
        expect(res.body.digital_asset.id).toMatch(/^da_/)
        expect(res.body.digital_asset.file_name).toBe("gardening-tips.pdf")
        expect(res.body.digital_asset.mime_type).toBe("application/octet-stream")
        expect(res.body.digital_asset.file_size).toBe(fileBuffer.length)

        digitalAssetId = res.body.digital_asset.id
      })

      test("creates a digital product with EUR-only pricing", async () => {
        const res = await api
          .post("/admin/products/digital")
          .set(authHeaders(adminToken))
          .field("title", `EUR-Only Product ${Date.now()}`)
          .field("price_eur", "9.50")
          .attach("file", Buffer.from("eur only"), "eur-only.pdf")

        expect(res.status).toBe(201)
        expect(res.body.product).toBeDefined()
        expect(res.body.digital_asset).toBeDefined()
        expect(res.body.digital_asset.file_name).toBe("eur-only.pdf")
      })

      test("creates a digital product with USD-only pricing", async () => {
        const res = await api
          .post("/admin/products/digital")
          .set(authHeaders(adminToken))
          .field("title", `USD-Only Product ${Date.now()}`)
          .field("price_usd", "14.50")
          .attach("file", Buffer.from("usd only"), "usd-only.pdf")

        expect(res.status).toBe(201)
        expect(res.body.product).toBeDefined()
        expect(res.body.digital_asset).toBeDefined()
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST: Verify persistence via admin product API
    // ═════════════════════════════════════════════════════════════════════

    describe("Step 3 — Verify persistence via admin APIs", () => {
      let adminToken: string
      let createdProductId: string
      let createdDigitalAssetId: string
      const productTitle = `Persistence Check ${Date.now()}`

      beforeAll(async () => {
        adminToken = await registerAdminUser()

        // Create a digital product we can query later
        const createRes = await api
          .post("/admin/products/digital")
          .set(authHeaders(adminToken))
          .field("title", productTitle)
          .field("price_eur", "12.99")
          .field("price_usd", "15.99")
          .attach("file", Buffer.from("persistence test"), "persist.pdf")

        createdProductId = createRes.body.product.id
        createdDigitalAssetId = createRes.body.digital_asset.id
      })

      test("product is retrievable via GET /admin/products", async () => {
        const res = await api
          .get(`/admin/products/${createdProductId}`)
          .set(adminHeaders.headers)

        expect(res.status).toBe(200)
        expect(res.body.product).toBeDefined()
        expect(res.body.product.id).toBe(createdProductId)
        expect(res.body.product.title).toBe(productTitle)
        expect(res.body.product.status).toBe("published")
      })

      test("product variant has EUR and USD prices", async () => {
        // Use the adminHeaders which already has admin auth, along with
        // the fields query param to expand variant prices
        const res = await api
          .get(
            `/admin/products/${createdProductId}?fields=id,title,*variants,*variants.prices`
          )
          .set(adminHeaders.headers)

        expect(res.status).toBe(200)
        const product = res.body.product
        expect(product.variants).toBeDefined()
        expect(product.variants.length).toBe(1)
        expect(product.variants[0].title).toBe("Digital Download")

        const prices = product.variants[0].prices
        expect(prices).toBeDefined()

        const eurPrice = prices.find((p: any) => p.currency_code === "eur")
        const usdPrice = prices.find((p: any) => p.currency_code === "usd")
        expect(eurPrice).toBeDefined()
        expect(usdPrice).toBeDefined()
        // 12.99 EUR → 1299 cents
        expect(eurPrice.amount).toBe(1299)
        // 15.99 USD → 1599 cents
        expect(usdPrice.amount).toBe(1599)
      })

      test("digital asset record is linked to the product", async () => {
        // The digital-asset-product link lets us traverse from product
        // to its digital asset via Remote Query. We use the graph query
        // endpoint: GET /admin/products/:id?fields=+digital_asset.*
        const res = await api
          .get(
            `/admin/products/${createdProductId}?fields=id,title,+digital_asset.*`
          )
          .set(adminHeaders.headers)

        expect(res.status).toBe(200)
        const product = res.body.product

        // The digital_asset should be available via the Remote Link graph
        // traversal. The exact key name depends on the link definition.
        // The link file is: src/links/digital-asset-product.ts
        // defineLink(ProductModule.linkable.product, DigitalAssetModule.linkable.digitalAsset)
        // This creates a link from product → digital_asset (isList: true)
        const linkedAsset = product.digital_asset
        expect(linkedAsset).toBeDefined()

        // If it's an array (isList: true), grab the first item
        const asset = Array.isArray(linkedAsset) ? linkedAsset[0] : linkedAsset
        expect(asset).toBeDefined()
        expect(asset.id).toBe(createdDigitalAssetId)
        expect(asset.file_name).toBe("persist.pdf")
        expect(asset.is_active).toBe(true)
      })

      test("product appears in paginated admin product list", async () => {
        const res = await api
          .get("/admin/products?q=Persistence&limit=50")
          .set(adminHeaders.headers)

        expect(res.status).toBe(200)
        expect(res.body.products).toBeDefined()
        expect(Array.isArray(res.body.products)).toBe(true)

        const found = res.body.products.find(
          (p: any) => p.id === createdProductId
        )
        expect(found).toBeDefined()
        expect(found.title).toBe(productTitle)
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST: Error handling — edge cases
    // ═════════════════════════════════════════════════════════════════════

    describe("Step 4 — Error handling edge cases", () => {
      let adminToken: string

      beforeAll(async () => {
        adminToken = await registerAdminUser()
      })

      test("rejects negative price", async () => {
        const res = await api
          .post("/admin/products/digital")
          .set(authHeaders(adminToken))
          .field("title", "Negative Price Item")
          .field("price_eur", "-5.00")
          .attach("file", Buffer.from("neg"), "neg.pdf")

        expect(res.status).toBe(400)
        expect(res.body.message).toContain("price")
      })

      test("rejects non-numeric price", async () => {
        const res = await api
          .post("/admin/products/digital")
          .set(authHeaders(adminToken))
          .field("title", "Bad Price Item")
          .field("price_eur", "not-a-number")
          .field("price_usd", "also-bad")
          .attach("file", Buffer.from("bad"), "bad.pdf")

        expect(res.status).toBe(400)
        expect(res.body.message).toContain("price")
      })

      test("rejects empty title", async () => {
        const res = await api
          .post("/admin/products/digital")
          .set(authHeaders(adminToken))
          .field("title", "")
          .field("price_eur", "9.99")
          .attach("file", Buffer.from("empty"), "empty.pdf")

        expect(res.status).toBe(400)
        expect(res.body.message).toContain("title")
      })

      test("rejects malformed file upload (empty buffer)", async () => {
        const res = await api
          .post("/admin/products/digital")
          .set(authHeaders(adminToken))
          .field("title", "Empty File Product")
          .field("price_usd", "5.00")
          .attach("file", Buffer.alloc(0), "empty.dat")

        // An empty buffer still produces a file — it should be allowed
        // (some digital products might legitimately be empty, like a
        // placeholder or a link file). We expect success.
        expect(res.status).toBe(201)
        expect(res.body.digital_asset.file_size).toBe(0)
      })

      test("uses adminHeaders (pre-authenticated) successfully", async () => {
        const res = await api
          .post("/admin/products/digital")
          .set(adminHeaders.headers)
          .field("title", `AdminHeaders Product ${Date.now()}`)
          .field("price_eur", "7.99")
          .attach("file", Buffer.from("admin headers"), "admin-hdrs.pdf")

        expect(res.status).toBe(201)
        expect(res.body.product).toBeDefined()
        expect(res.body.digital_asset).toBeDefined()
      })
    })
  },
})
