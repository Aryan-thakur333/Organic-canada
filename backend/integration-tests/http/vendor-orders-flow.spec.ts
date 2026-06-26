import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"

jest.setTimeout(120 * 1000)

/**
 * Integration tests for vendor order operations.
 *
 * Covers:
 *   1. Vendor can list their orders (empty + with orders)
 *   2. Vendor sees only orders containing their products (filtering)
 *   3. Vendor order action: accept / reject / fulfill
 *   4. Vendor tracking: add and retrieve tracking info
 *   5. Error handling (401, 400, 404)
 */
medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, adminHeaders, container }) => {
    // ── Helpers ──────────────────────────────────────────────────────────

    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

    async function registerAndApproveVendor(storeName: string) {
      const email = `order-vendor-${storeName}-${uid()}@eatsie.test`
      const regRes = await api.post("/vendor/register").send({
        name: storeName,
        store_name: storeName,
        email,
        password: "OrderVendor123!",
      })
      const vendorId = regRes.body.vendor.id

      await api
        .post(`/admin/vendors/${vendorId}/approve`)
        .set(adminHeaders.headers)
        .expect(200)

      const loginRes = await api.post("/vendor/login").send({ email, password: "OrderVendor123!" })
      return { id: vendorId, email, token: loginRes.body.token }
    }

    const vendorAuth = (token: string) => ({ Authorization: `Bearer ${token}` })

    // ── Shared data ──────────────────────────────────────────────────────

    let vendor: { id: string; email: string; token: string }
    let vendorB: { id: string; email: string; token: string }
    let productId: string
    let variantId: string
    let vendorBProductId: string
    let orderId: string

    beforeAll(async () => {
      vendor = await registerAndApproveVendor("OrderTestVendor")
      vendorB = await registerAndApproveVendor("OrderTestVendorB")

      // Create products for both vendors
      const prodRes = await api
        .post("/vendor/products")
        .set(vendorAuth(vendor.token))
        .send({ title: `Order Test Product ${uid()}`, price: 29.99 })

      productId = prodRes.body.product.id
      variantId = prodRes.body.product.variants?.[0]?.id

      const prodResB = await api
        .post("/vendor/products")
        .set(vendorAuth(vendorB.token))
        .send({ title: `Order Test Product B ${uid()}`, price: 49.99 })

      vendorBProductId = prodResB.body.product.id

      // Create a real order containing vendor's product variant.
      // This uses the Medusa Order module directly so the vendor
      // order listing/action/tracking endpoints have real data.
      const orderModuleService: any = container.resolve(Modules.ORDER)
      const createdOrder = await orderModuleService.createOrders({
        email: "customer@eatsie.test",
        currency_code: "usd",
        items: [
          {
            title: "Order Test Product",
            quantity: 2,
            unit_price: 2999,
            variant_id: variantId,
            product_id: productId,
          },
        ],
        metadata: {
          test_order: true,
          source: "integration-test",
        },
      })

      orderId = createdOrder.id

      // Link the order to the vendor via remoteLink so the graph query works
      const remoteLink: any = container.resolve("remoteLink")
      try {
        await remoteLink.create({
          [Modules.ORDER]: { order_id: orderId },
          vendor: { vendor_id: vendor.id },
        })
      } catch {
        // Link may already exist or fail silently — non-fatal for tests
      }
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST: Vendor Order Listing — Positive & Negative
    // ═════════════════════════════════════════════════════════════════════

    describe("GET /vendor/orders — Vendor order listing & filtering", () => {
      test("returns 401 without auth token", async () => {
        const res = await api.get("/vendor/orders")
        expect(res.status).toBe(401)
        expect(res.body.message).toMatch(/token required/i)
      })

      test("Vendor sees orders containing their products", async () => {
        const res = await api
          .get("/vendor/orders")
          .set(vendorAuth(vendor.token))

        expect(res.status).toBe(200)
        expect(Array.isArray(res.body.orders)).toBe(true)
        expect(res.body.orders.length).toBeGreaterThanOrEqual(1)

        // Verify the order contains vendor's items
        const order = res.body.orders[0]
        expect(order.id).toBe(orderId)
        expect(order.display_id).toBeTruthy()
        expect(order.status).toBeDefined()
        expect(Array.isArray(order.items)).toBe(true)

        // Vendor subtotal should reflect vendor's items
        expect(order.vendor_subtotal).toBeGreaterThan(0)
      })

      test("returned order has expected vendor-specific fields", async () => {
        const res = await api
          .get("/vendor/orders")
          .set(vendorAuth(vendor.token))

        const order = res.body.orders[0]
        expect(order).toHaveProperty("id")
        expect(order).toHaveProperty("display_id")
        expect(order).toHaveProperty("status")
        expect(order).toHaveProperty("fulfillment_status")
        expect(order).toHaveProperty("payment_status")
        expect(order).toHaveProperty("created_at")
        expect(order).toHaveProperty("items")
        expect(order).toHaveProperty("vendor_subtotal")
      })

      test("Vendor A sees own orders, Vendor B does NOT see Vendor A's orders", async () => {
        const [resA, resB] = await Promise.all([
          api.get("/vendor/orders").set(vendorAuth(vendor.token)),
          api.get("/vendor/orders").set(vendorAuth(vendorB.token)),
        ])

        const orderIdsA = new Set(resA.body.orders.map((o: any) => o.id))
        const orderIdsB = new Set(resB.body.orders.map((o: any) => o.id))

        // Vendor A should see their order
        expect(orderIdsA.has(orderId)).toBe(true)

        // Vendor B should NOT see Vendor A's order (no product match)
        expect(orderIdsB.has(orderId)).toBe(false)
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST: Vendor order actions (accept/reject/fulfill)
    // ═════════════════════════════════════════════════════════════════════

    describe("POST /vendor/orders/action/:id — Order actions", () => {
      test("returns 404 for non-existent order", async () => {
        const res = await api
          .post("/vendor/orders/action/fake-order-id")
          .set(vendorAuth(vendor.token))
          .send({ action: "accept" })

        expect(res.status).toBe(404)
      })

      test("returns 400 for invalid action type", async () => {
        const res = await api
          .post("/vendor/orders/action/fake-order-id")
          .set(vendorAuth(vendor.token))
          .send({ action: "invalid_action" })

        expect(res.status).toBe(400)
        expect(res.body.message).toMatch(/action must be/i)
      })

      test("returns 400 when action is missing from body", async () => {
        const res = await api
          .post("/vendor/orders/action/fake-order-id")
          .set(vendorAuth(vendor.token))
          .send({})

        expect(res.status).toBe(400)
        expect(res.body.message).toMatch(/action must be/i)
      })

      test("Vendor can accept their order", async () => {
        const res = await api
          .post(`/vendor/orders/action/${orderId}`)
          .set(vendorAuth(vendor.token))
          .send({ action: "accept" })

        expect(res.status).toBe(200)
        expect(res.body.message).toMatch(/accepted/i)
        expect(res.body.vendor_fulfillment_status).toBe("accepted")
        expect(res.body.action).toBeDefined()
      })

      test("Vendor A's action is isolated — Vendor B cannot act on same order", async () => {
        const res = await api
          .post(`/vendor/orders/action/${orderId}`)
          .set(vendorAuth(vendorB.token))
          .send({ action: "accept" })

        expect(res.status).toBe(404)
        expect(res.body.message).toMatch(/no vendor items/i)
      })

      test("calling action again on accepted order returns 409", async () => {
        const res = await api
          .post(`/vendor/orders/action/${orderId}`)
          .set(vendorAuth(vendor.token))
          .send({ action: "fulfill" })

        expect(res.status).toBe(409)
        expect(res.body.message).toMatch(/already.*accepted/i)
      })

      test("GET /vendor/orders/action/:id returns current action status", async () => {
        const res = await api
          .get(`/vendor/orders/action/${orderId}`)
          .set(vendorAuth(vendor.token))

        expect(res.status).toBe(200)
        expect(res.body.order_id).toBe(orderId)
        expect(res.body.vendor_action).toBeDefined()
        expect(res.body.vendor_action.action).toBe("accept")
        expect(res.body.order_status).toBeDefined()
        expect(res.body.fulfillment_status).toBeDefined()
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST: Vendor tracking endpoints — Positive & Negative
    // ═════════════════════════════════════════════════════════════════════

    describe("POST /vendor/orders/fulfill/:id — Tracking", () => {
      test("returns 400 when tracking_code is missing", async () => {
        const res = await api
          .post(`/vendor/orders/fulfill/${orderId}`)
          .set(vendorAuth(vendor.token))
          .send({ carrier: "UPS" })

        expect(res.status).toBe(400)
        expect(res.body.message).toMatch(/tracking_code/i)
      })

      test("Vendor can add tracking info to their order", async () => {
        const res = await api
          .post(`/vendor/orders/fulfill/${orderId}`)
          .set(vendorAuth(vendor.token))
          .send({
            tracking_code: "1Z999AA10123456784",
            carrier: "UPS",
            tracking_url: "https://www.ups.com/track?num=1Z999AA10123456784",
          })

        expect(res.status).toBe(200)
        expect(res.body.message).toMatch(/tracking.*added/i)
        expect(res.body.tracking).toBeDefined()
        expect(res.body.tracking.tracking_code).toBe("1Z999AA10123456784")
        expect(res.body.tracking.carrier).toBe("UPS")
      })

      test("Vendor can retrieve tracking info via GET", async () => {
        const res = await api
          .get(`/vendor/orders/fulfill/${orderId}`)
          .set(vendorAuth(vendor.token))

        expect(res.status).toBe(200)
        expect(res.body.tracking).toBeDefined()
        expect(res.body.tracking.tracking_code).toBe("1Z999AA10123456784")
        expect(res.body.tracking.carrier).toBe("UPS")
        expect(res.body.fulfillment_status).toBeDefined()
      })

      test("Vendor B cannot see Vendor A's tracking info", async () => {
        const res = await api
          .get(`/vendor/orders/fulfill/${orderId}`)
          .set(vendorAuth(vendorB.token))

        expect(res.status).toBe(404)
        expect(res.body.message).toMatch(/no vendor items/i)
      })
    })
  },
})
