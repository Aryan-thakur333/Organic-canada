import { medusaIntegrationTestRunner } from "@medusajs/test-utils"

jest.setTimeout(120 * 1000)

/**
 * Integration tests for vendor product ownership and CRUD operations.
 *
 * Covers:
 *   1. Vendor A creates a product → gets 201, product linked to vendor
 *   2. Vendor A lists own products → sees their product
 *   3. Vendor B lists own products → does NOT see Vendor A's product
 *   4. Vendor B tries to edit Vendor A's product → gets 403
 *   5. Vendor B tries to delete Vendor A's product → gets 403
 *   6. Vendor A updates their own product → gets 200
 *   7. Vendor A creates a product with variants, categories, tags → gets 201
 *   8. Admin can see all vendor products via /admin/vendor-products
 */
medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, adminHeaders }) => {
    // ── Helpers ──────────────────────────────────────────────────────────

    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

    /** Register a vendor and return { id, email, token } */
    async function registerVendor(storeName: string): Promise<{
      id: string
      email: string
      token: string
    }> {
      const email = `vendor-${storeName}-${uid()}@eatsie.test`
      const regRes = await api.post("/vendor/register").send({
        name: storeName,
        store_name: storeName,
        email,
        password: "TestVendorPass123!",
      })
      const vendorId = regRes.body.vendor.id

      // Admin approves the vendor
      await api
        .post(`/admin/vendors/${vendorId}/approve`)
        .set(adminHeaders.headers)
        .expect(200)

      // Login to get JWT
      const loginRes = await api.post("/vendor/login").send({
        email,
        password: "TestVendorPass123!",
      })
      return { id: vendorId, email, token: loginRes.body.token }
    }

    /** Build auth header for a vendor token */
    const vendorAuth = (token: string) => ({ Authorization: `Bearer ${token}` })

    // ── Shared data ──────────────────────────────────────────────────────

    let vendorA: { id: string; email: string; token: string }
    let vendorB: { id: string; email: string; token: string }
    let productAId: string
    let productBId: string

    beforeAll(async () => {
      vendorA = await registerVendor("VendorA")
      vendorB = await registerVendor("VendorB")
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST: Product Creation
    // ═════════════════════════════════════════════════════════════════════

    describe("POST /vendor/products — Vendor creates products", () => {
      test("Vendor A creates a product with a price", async () => {
        const res = await api
          .post("/vendor/products")
          .set(vendorAuth(vendorA.token))
          .send({
            title: `Organic Honey - ${uid()}`,
            price: 14.99,
            description: "Pure organic honey from local farms.",
          })

        expect(res.status).toBe(201)
        expect(res.body.message).toMatch(/created.*linked/i)
        expect(res.body.product).toBeDefined()
        expect(res.body.product.id).toBeTruthy()
        expect(res.body.product.title).toContain("Organic Honey")
        expect(res.body.product.status).toBe("published")

        productAId = res.body.product.id
      })

      test("Vendor A creates a product with multiple variants", async () => {
        const res = await api
          .post("/vendor/products")
          .set(vendorAuth(vendorA.token))
          .send({
            title: `Multi-Variant Product - ${uid()}`,
            status: "draft",
            variants: [
              { title: "Small", price: 9.99, sku: "MV-SML", manage_inventory: true },
              { title: "Medium", price: 14.99, sku: "MV-MED", manage_inventory: true },
              { title: "Large", price: 19.99, sku: "MV-LRG", allow_backorder: true },
            ],
          })

        expect(res.status).toBe(201)
        expect(res.body.product.variants).toHaveLength(3)
        expect(res.body.product.status).toBe("draft")
      })

      test("Vendor B creates their own product", async () => {
        const res = await api
          .post("/vendor/products")
          .set(vendorAuth(vendorB.token))
          .send({
            title: `Vendor B Product - ${uid()}`,
            price: 24.99,
          })

        expect(res.status).toBe(201)
        productBId = res.body.product.id
      })

      test("returns 401 without auth token", async () => {
        const res = await api.post("/vendor/products").send({
          title: "Unauthorized Product",
          price: 10.0,
        })

        expect(res.status).toBe(401)
        expect(res.body.message).toMatch(/token required/i)
      })

      test("returns 400 without title", async () => {
        const res = await api
          .post("/vendor/products")
          .set(vendorAuth(vendorA.token))
          .send({ price: 10.0 })

        expect(res.status).toBe(400)
        expect(res.body.message).toMatch(/title/i)
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST: Product Listing — Ownership Isolation
    // ═════════════════════════════════════════════════════════════════════

    describe("GET /vendor/products — Ownership isolation", () => {
      test("Vendor A sees their products but not Vendor B's", async () => {
        const res = await api
          .get("/vendor/products")
          .set(vendorAuth(vendorA.token))

        expect(res.status).toBe(200)
        expect(Array.isArray(res.body.products)).toBe(true)

        const ids = res.body.products.map((p: any) => p.id)
        expect(ids).toContain(productAId)
        expect(ids).not.toContain(productBId)
      })

      test("Vendor B sees their products but not Vendor A's", async () => {
        const res = await api
          .get("/vendor/products")
          .set(vendorAuth(vendorB.token))

        expect(res.status).toBe(200)
        const ids = res.body.products.map((p: any) => p.id)
        expect(ids).toContain(productBId)
        expect(ids).not.toContain(productAId)
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST: Product Update — Ownership Enforcement
    // ═════════════════════════════════════════════════════════════════════

    describe("PUT /vendor/products/:id — Ownership enforcement", () => {
      test("Vendor B cannot update Vendor A's product (403)", async () => {
        const res = await api
          .put(`/vendor/products/${productAId}`)
          .set(vendorAuth(vendorB.token))
          .send({ title: "Hacked Title", price: 1.99 })

        expect(res.status).toBe(403)
        expect(res.body.message).toMatch(/do not own/i)
      })

      test("Vendor A can update their own product", async () => {
        const res = await api
          .put(`/vendor/products/${productAId}`)
          .set(vendorAuth(vendorA.token))
          .send({
            title: "Updated Organic Honey",
            description: "Updated description for the product.",
            price: 16.99,
          })

        expect(res.status).toBe(200)
        expect(res.body.message).toMatch(/updated successfully/i)
        expect(res.body.product).toBeDefined()
      })

      test("Vendor A can publish/unpublish their product", async () => {
        // Unpublish (draft)
        const draftRes = await api
          .put(`/vendor/products/${productAId}`)
          .set(vendorAuth(vendorA.token))
          .send({ status: "draft" })

        expect(draftRes.status).toBe(200)

        // Republish
        const pubRes = await api
          .put(`/vendor/products/${productAId}`)
          .set(vendorAuth(vendorA.token))
          .send({ status: "published" })

        expect(pubRes.status).toBe(200)
      })

      test("Vendor A can update product with categories and tags", async () => {
        const res = await api
          .put(`/vendor/products/${productAId}`)
          .set(vendorAuth(vendorA.token))
          .send({
            title: "Organic Honey With Categories",
            categories: [],
            tags: [],
          })

        expect(res.status).toBe(200)
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST: Product Delete — Ownership Enforcement
    // ═════════════════════════════════════════════════════════════════════

    describe("DELETE /vendor/products/:id — Ownership enforcement", () => {
      let tempProductId: string

      beforeAll(async () => {
        // Vendor A creates a temp product for delete tests
        const res = await api
          .post("/vendor/products")
          .set(vendorAuth(vendorA.token))
          .send({ title: "Temp Product for Delete", price: 5.99 })
        tempProductId = res.body.product.id
      })

      test("Vendor B cannot delete Vendor A's product (403)", async () => {
        const res = await api
          .delete(`/vendor/products/${tempProductId}`)
          .set(vendorAuth(vendorB.token))

        expect(res.status).toBe(403)
        expect(res.body.message).toMatch(/do not own/i)
      })

      test("Vendor A can delete their own product", async () => {
        const res = await api
          .delete(`/vendor/products/${tempProductId}`)
          .set(vendorAuth(vendorA.token))

        expect(res.status).toBe(200)
        expect(res.body.message).toMatch(/deleted successfully/i)

        // Verify it's gone from vendor A's product list
        const listRes = await api
          .get("/vendor/products")
          .set(vendorAuth(vendorA.token))
        const ids = listRes.body.products.map((p: any) => p.id)
        expect(ids).not.toContain(tempProductId)
      })

      test("returns 404 for non-existent product", async () => {
        const res = await api
          .delete("/vendor/products/non-existent-id")
          .set(vendorAuth(vendorA.token))

        expect(res.status).toBe(404)
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST: Admin can see all vendor products
    // ═════════════════════════════════════════════════════════════════════

    describe("GET /admin/vendor-products — Admin sees all", () => {
      test("admin can list all vendor products", async () => {
        const res = await api
          .get("/admin/vendor-products")
          .set(adminHeaders.headers)

        expect(res.status).toBe(200)
        expect(Array.isArray(res.body.vendor_products)).toBe(true)
        expect(res.body.count).toBeGreaterThanOrEqual(2)

        const ids = res.body.vendor_products.map((p: any) => p.id)
        expect(ids).toContain(productAId)
        expect(ids).toContain(productBId)
      })
    })
  },
})
