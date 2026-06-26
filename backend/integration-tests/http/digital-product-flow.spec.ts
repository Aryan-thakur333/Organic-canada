import { medusaIntegrationTestRunner } from "@medusajs/test-utils"

jest.setTimeout(120 * 1000)

/**
 * Integration test verifying the complete admin auth + digital product flow.
 *
 * ALL logic runs in a single test to avoid the test runner's beforeEach/afterEach
 * lifecycle which can invalidate auth state between tests.
 *
 * NOTE: The test runner's `api` is an **axios** instance, not supertest.
 *   - POST: api.post(url, data, config)
 *   - GET:  api.get(url, config)
 *   - Multipart: use FormData + Blob as the data argument
 *   - Response: res.status (number), res.data (parsed body)
 *   - Error statuses: add `validateStatus: () => true` to config to prevent
 *     axios from throwing AxiosError on 4xx/5xx responses.
 */

medusaIntegrationTestRunner({
  inApp: true,
  disableAutoTeardown: true,
  env: {},
  testSuite: ({ api }) => {
    // ── Helpers ──────────────────────────────────────────────────────────

    const TEST_EMAIL = `digital-admin-${Date.now()}@eatsie.test`
    const TEST_PASSWORD = "DigitaT3st!"

    /** Return config with validateStatus + optional headers. */
    function withDefaults(headers?: Record<string, string>): Record<string, any> {
      return {
        validateStatus: () => true,
        ...(headers ? { headers } : {}),
      }
    }

    function authHeaders(token: string): Record<string, string> {
      return { Authorization: `Bearer ${token}` }
    }

    /** Create a multipart FormData payload for digital product creation. */
    function createDigitalProductForm({
      title,
      price_eur,
      price_usd,
      fileBuffer,
      fileName,
    }: {
      title: string
      price_eur?: string
      price_usd?: string
      fileBuffer?: Buffer
      fileName?: string
    }): FormData {
      const form = new FormData()
      form.append("title", title)
      if (price_eur) form.append("price_eur", price_eur)
      if (price_usd) form.append("price_usd", price_usd)
      if (fileBuffer) {
        const blob = new Blob([fileBuffer], { type: "application/octet-stream" })
        form.append("file", blob, fileName || "file.bin")
      }
      return form
    }

    // ═════════════════════════════════════════════════════════════════════
    //  SINGLE FLOW — all tests run sequentially within one it() block
    // ═════════════════════════════════════════════════════════════════════

    it("completes the full admin → auth → digital product → persistence flow", async () => {
      // ── Step 1: Admin Registration & Login ──────────────────────────

      // Register
      const regRes = await api.post(
        "/auth/user/emailpass/register",
        { email: TEST_EMAIL, password: TEST_PASSWORD },
        withDefaults()
      )
      expect(regRes.status).toBe(200)
      expect(regRes.data.token).toBeDefined()
      expect(typeof regRes.data.token).toBe("string")
      const adminToken = regRes.data.token

      // Login with same credentials
      const loginRes = await api.post(
        "/auth/user/emailpass",
        { email: TEST_EMAIL, password: TEST_PASSWORD },
        withDefaults()
      )
      expect(loginRes.status).toBe(200)
      expect(loginRes.data.token).toBeDefined()

      // Login with wrong password — expect 401
      const wrongRes = await api.post(
        "/auth/user/emailpass",
        { email: TEST_EMAIL, password: "WrongPass123!" },
        withDefaults()
      )
      expect(wrongRes.status).toBe(401)
      expect(wrongRes.data.message).toMatch(/invalid|Incorrect|not found/i)

      console.log("✓ Step 1: Admin registration and login")

      // ── Step 2: Digital Product Creation ────────────────────────────

      // 401 without auth
      const noAuthForm = createDigitalProductForm({
        title: "Unauthorized Product",
        price_eur: "9.99",
      })
      const noAuthRes = await api.post("/admin/products/digital", noAuthForm, withDefaults())
      expect(noAuthRes.status).toBe(401)

      // 400 — missing title
      const noTitleForm = createDigitalProductForm({
        title: "",
        price_eur: "14.99",
        fileBuffer: Buffer.from("content"),
        fileName: "file.bin",
      })
      const noTitleRes = await api.post(
        "/admin/products/digital",
        noTitleForm,
        withDefaults(authHeaders(adminToken))
      )
      expect(noTitleRes.status).toBe(400)
      expect(noTitleRes.data.message).toContain("title")

      // 400 — missing file
      const noFileForm = createDigitalProductForm({
        title: "No File Product",
        price_usd: "29.99",
      })
      const noFileRes = await api.post(
        "/admin/products/digital",
        noFileForm,
        withDefaults(authHeaders(adminToken))
      )
      expect(noFileRes.status).toBe(400)
      expect(noFileRes.data.message).toContain("file")

      // 400 — no price
      const noPriceForm = createDigitalProductForm({
        title: "No Price Product",
        fileBuffer: Buffer.from("data"),
        fileName: "noprice.dat",
      })
      const noPriceRes = await api.post(
        "/admin/products/digital",
        noPriceForm,
        withDefaults(authHeaders(adminToken))
      )
      expect(noPriceRes.status).toBe(400)
      expect(noPriceRes.data.message).toContain("price")

      // 400 — negative price
      const negPriceForm = createDigitalProductForm({
        title: "Negative Price",
        price_eur: "-5.00",
        fileBuffer: Buffer.from("neg"),
        fileName: "neg.pdf",
      })
      const negPriceRes = await api.post(
        "/admin/products/digital",
        negPriceForm,
        withDefaults(authHeaders(adminToken))
      )
      expect(negPriceRes.status).toBe(400)
      expect(negPriceRes.data.message).toContain("price")

      // 400 — non-numeric price
      const badPriceForm = createDigitalProductForm({
        title: "Bad Price",
        price_eur: "not-a-number",
        price_usd: "also-bad",
        fileBuffer: Buffer.from("bad"),
        fileName: "bad.pdf",
      })
      const badPriceRes = await api.post(
        "/admin/products/digital",
        badPriceForm,
        withDefaults(authHeaders(adminToken))
      )
      expect(badPriceRes.status).toBe(400)
      expect(badPriceRes.data.message).toContain("price")

      // 400 — empty title
      const emptyTitleForm = createDigitalProductForm({
        title: "",
        price_eur: "9.99",
        fileBuffer: Buffer.from("empty"),
        fileName: "empty.pdf",
      })
      const emptyTitleRes = await api.post(
        "/admin/products/digital",
        emptyTitleForm,
        withDefaults(authHeaders(adminToken))
      )
      expect(emptyTitleRes.status).toBe(400)
      expect(emptyTitleRes.data.message).toContain("title")

      // Create digital product with both CAD and USD prices
      const productTitle = `E-Book: Gardening Tips ${Date.now()}`
      const fileBuffer = Buffer.from(
        "This is a sample digital asset file content for testing.",
        "utf-8"
      )
      const createForm = createDigitalProductForm({
        title: productTitle,
        price_eur: "19.99",
        price_usd: "24.99",
        fileBuffer,
        fileName: "gardening-tips.pdf",
      })
      const createRes = await api.post(
        "/admin/products/digital",
        createForm,
        withDefaults(authHeaders(adminToken))
      )

      expect(createRes.status).toBe(201)
      expect(createRes.data.product).toBeDefined()
      expect(createRes.data.product.id).toBeTruthy()
      expect(createRes.data.product.title).toBe(productTitle)
      expect(createRes.data.digital_asset).toBeDefined()
      expect(createRes.data.digital_asset.id).toMatch(/^da_/)
      expect(createRes.data.digital_asset.file_name).toBe("gardening-tips.pdf")

      const productId = createRes.data.product.id
      const digitalAssetId = createRes.data.digital_asset.id

      // Create with CAD-only pricing
      const cadOnlyForm = createDigitalProductForm({
        title: `CAD-Only ${Date.now()}`,
        price_eur: "9.50",
        fileBuffer: Buffer.from("cad only"),
        fileName: "cad-only.pdf",
      })
      const cadOnlyRes = await api.post(
        "/admin/products/digital",
        cadOnlyForm,
        withDefaults(authHeaders(adminToken))
      )
      expect(cadOnlyRes.status).toBe(201)

      // Create with USD-only pricing
      const usdOnlyForm = createDigitalProductForm({
        title: `USD-Only ${Date.now()}`,
        price_usd: "14.50",
        fileBuffer: Buffer.from("usd only"),
        fileName: "usd-only.pdf",
      })
      const usdOnlyRes = await api.post(
        "/admin/products/digital",
        usdOnlyForm,
        withDefaults(authHeaders(adminToken))
      )
      expect(usdOnlyRes.status).toBe(201)

      console.log("✓ Step 2: Digital product creation")

      // ── Step 3: Persistence Verification ────────────────────────────

      // Retrieve product
      const getRes = await api.get(
        `/admin/products/${productId}`,
        withDefaults(authHeaders(adminToken))
      )
      expect(getRes.status).toBe(200)
      expect(getRes.data.product.id).toBe(productId)
      expect(getRes.data.product.status).toBe("published")

      // Verify variants and prices
      const detailsRes = await api.get(
        `/admin/products/${productId}?fields=id,title,*variants,*variants.prices`,
        withDefaults(authHeaders(adminToken))
      )
      expect(detailsRes.status).toBe(200)
      const product = detailsRes.data.product
      expect(product.variants).toBeDefined()
      expect(product.variants.length).toBe(1)
      expect(product.variants[0].title).toBe("Digital Download")

      const prices = product.variants[0].prices
      const cadPrice = prices.find((p: any) => p.currency_code === "cad")
      const usdPrice = prices.find((p: any) => p.currency_code === "usd")
      expect(cadPrice).toBeDefined()
      expect(usdPrice).toBeDefined()
      expect(cadPrice.amount).toBe(1999) // 19.99 CAD → 1999 cents
      expect(usdPrice.amount).toBe(2499) // 24.99 USD → 2499 cents

      // Verify digital asset link
      const linkRes = await api.get(
        `/admin/products/${productId}?fields=id,title,+digital_asset.*`,
        withDefaults(authHeaders(adminToken))
      )
      expect(linkRes.status).toBe(200)
      const linkedAsset = linkRes.data.product.digital_asset
      expect(linkedAsset).toBeDefined()
      const asset = Array.isArray(linkedAsset) ? linkedAsset[0] : linkedAsset
      expect(asset.id).toBe(digitalAssetId)

      // Find in product list
      const listRes = await api.get(
        `/admin/products?q=Gardening&limit=50`,
        withDefaults(authHeaders(adminToken))
      )
      expect(listRes.status).toBe(200)
      expect(listRes.data.products).toBeDefined()
      const found = listRes.data.products.find((p: any) => p.id === productId)
      expect(found).toBeDefined()

      console.log("✓ Step 3: Persistence verification")

      // ── Step 4: Edge Cases ──────────────────────────────────────────

      // Accept empty file buffer
      const emptyFileForm = createDigitalProductForm({
        title: `Empty File ${Date.now()}`,
        price_usd: "5.00",
        fileBuffer: Buffer.alloc(0),
        fileName: "empty.dat",
      })
      const emptyFileRes = await api.post(
        "/admin/products/digital",
        emptyFileForm,
        withDefaults(authHeaders(adminToken))
      )
      expect(emptyFileRes.status).toBe(201)
      expect(emptyFileRes.data.digital_asset.file_size).toBe(0)

      // Token-based auth works
      const tokenForm = createDigitalProductForm({
        title: `Token-Auth ${Date.now()}`,
        price_eur: "7.99",
        fileBuffer: Buffer.from("token"),
        fileName: "token.pdf",
      })
      const tokenRes = await api.post(
        "/admin/products/digital",
        tokenForm,
        withDefaults(authHeaders(adminToken))
      )
      expect(tokenRes.status).toBe(201)
      expect(tokenRes.data.product).toBeDefined()
      expect(tokenRes.data.digital_asset).toBeDefined()

      console.log("✓ Step 4: Edge cases")
      console.log("✓ ALL TESTS PASSED")
    })
  },
})
