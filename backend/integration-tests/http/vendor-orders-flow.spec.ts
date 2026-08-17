import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import { createAndLoginAdmin, registerAndApproveVendor } from "../helpers/integration-auth"
import { ensureVendorStockLocation } from "../helpers/vendor-location"
import { splitOrderWorkflow } from "../../src/workflows/split-order-workflow"
import { createVendorOrdersFromOrderWorkflow } from "../../src/workflows/create-vendor-orders-from-order"

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
  testSuite: ({ api, adminHeaders, container, getContainer }) => {
    // ── Helpers ──────────────────────────────────────────────────────────

    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

    // ── Shared data ──────────────────────────────────────────────────────

    let vendor: { id: string; email: string; token: string; headers: Record<string, string> }
    let vendorB: { id: string; email: string; token: string; headers: Record<string, string> }
    let productId: string
    let variantId: string
    let vendorBProductId: string
    let orderId: string
    let vendorOrderId: string
    let adminAuth: { email: string; token: string; headers: Record<string, string> }

    beforeAll(async () => {
      const activeContainer = getContainer()
      adminAuth = await createAndLoginAdmin(activeContainer, api)

      vendor = await registerAndApproveVendor(api, "OrderTestVendor", adminAuth.headers)
      vendorB = await registerAndApproveVendor(api, "OrderTestVendorB", adminAuth.headers)

      await ensureVendorStockLocation({ container: activeContainer, vendorId: vendor.id, storeName: "OrderTestVendor" })
      await ensureVendorStockLocation({ container: activeContainer, vendorId: vendorB.id, storeName: "OrderTestVendorB" })

      // Create products for both vendors
      const prodRes = await api.post("/vendor/products", {
        title: `Order Test Product ${uid()}`,
        price: 29.99,
      }, {
        headers: vendor.headers,
        validateStatus: () => true,
      })

      productId = prodRes.data.product.id
      variantId = prodRes.data.product.variants?.[0]?.id

      const prodResB = await api.post("/vendor/products", {
        title: `Order Test Product B ${uid()}`,
        price: 49.99,
      }, {
        headers: vendorB.headers,
        validateStatus: () => true,
      })

      vendorBProductId = prodResB.data.product.id

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

      // Run splitOrderWorkflow and createVendorOrdersFromOrderWorkflow to generate VendorOrders
      const splitResult = await splitOrderWorkflow(container).run({
        input: {
          orderId,
          currency_code: "usd",
          items: createdOrder.items.map((i: any) => ({
            id: i.id,
            product_id: i.product_id,
            title: i.title,
            quantity: i.quantity,
            unit_price: i.unit_price,
            thumbnail: i.thumbnail ?? null,
          }))
        }
      })

      const createdVO = await createVendorOrdersFromOrderWorkflow(container).run({
        input: {
          orderId,
          currency_code: "usd",
          buckets: splitResult.result.buckets,
        }
      })
      vendorOrderId = createdVO.result[0].id
      console.log(`[SETUP] order-ready vendorOrderId=${vendorOrderId}`)
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST: Vendor Order Listing — Positive & Negative
    // ═════════════════════════════════════════════════════════════════════

    describe("GET /vendor/orders — Vendor order listing & filtering", () => {
      test("returns 401 without auth token", async () => {
        const res = await api.get("/vendor/orders", { validateStatus: () => true })
        expect(res.status).toBe(401)
        expect(res.data.message).toMatch(/token required/i)
      })

      test("Vendor sees orders containing their products", async () => {
        const res = await api.get("/vendor/orders", {
          headers: vendor.headers,
          validateStatus: () => true,
        })

        expect(res.status).toBe(200)
        expect(Array.isArray(res.data.orders)).toBe(true)
        expect(res.data.orders.length).toBeGreaterThanOrEqual(1)

        // Verify the order contains vendor's items
        const order = res.data.orders[0]
        expect(order.id).toBe(vendorOrderId)
        expect(order.display_id).toBeTruthy()
        expect(order.status).toBeDefined()
        expect(Array.isArray(order.items)).toBe(true)

        // Vendor subtotal should reflect vendor's items
        expect(order.vendor_subtotal).toBeGreaterThan(0)
      })

      test("returned order has expected vendor-specific fields", async () => {
        const res = await api.get("/vendor/orders", {
          headers: vendor.headers,
          validateStatus: () => true,
        })

        const order = res.data.orders[0]
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
          api.get("/vendor/orders", { headers: vendor.headers, validateStatus: () => true }),
          api.get("/vendor/orders", { headers: vendorB.headers, validateStatus: () => true }),
        ])

        const orderIdsA = new Set(resA.data.orders.map((o: any) => o.id))
        const orderIdsB = new Set(resB.data.orders.map((o: any) => o.id))

        // Vendor A should see their order
        expect(orderIdsA.has(vendorOrderId)).toBe(true)

        // Vendor B should NOT see Vendor A's order (no product match)
        expect(orderIdsB.has(vendorOrderId)).toBe(false)
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST: Vendor order actions (accept/reject/fulfill)
    // ═════════════════════════════════════════════════════════════════════

    // NOTE: The endpoints POST /vendor/orders/action/:id and GET /vendor/orders/action/:id
    // expect the parent Order.id (not vendorOrderId). The controllers verify vendor
    // access to the order by checking if any item in the order is owned by the vendor.
    describe("POST /vendor/orders/action/:id — Order actions", () => {
      test("returns 404 for non-existent order", async () => {
        const res = await api.post("/vendor/orders/action/fake-order-id", {
          action: "accept",
        }, {
          headers: vendor.headers,
          validateStatus: () => true,
        })

        expect(res.status).toBe(404)
      })

      test("returns 400 for invalid action type", async () => {
        const res = await api.post("/vendor/orders/action/fake-order-id", {
          action: "invalid_action",
        }, {
          headers: vendor.headers,
          validateStatus: () => true,
        })

        expect(res.status).toBe(400)
        expect(res.data.message).toMatch(/action must be/i)
      })

      test("returns 400 when action is missing from body", async () => {
        const res = await api.post("/vendor/orders/action/fake-order-id", {}, {
          headers: vendor.headers,
          validateStatus: () => true,
        })

        expect(res.status).toBe(400)
        expect(res.data.message).toMatch(/action must be/i)
      })

      test("Vendor can accept their order", async () => {
        const res = await api.post(`/vendor/orders/action/${orderId}`, {
          action: "accept",
        }, {
          headers: vendor.headers,
          validateStatus: () => true,
        })

        expect(res.status).toBe(200)
        expect(res.data.message).toMatch(/accepted/i)
        expect(res.data.vendor_fulfillment_status).toBe("accepted")
        expect(res.data.action).toBeDefined()
      })

      test("Vendor A's action is isolated — Vendor B cannot act on same order", async () => {
        const res = await api.post(`/vendor/orders/action/${orderId}`, {
          action: "accept",
        }, {
          headers: vendorB.headers,
          validateStatus: () => true,
        })

        expect(res.status).toBe(404)
        expect(res.data.message).toMatch(/no vendor items/i)
      })

      test("calling action again on accepted order returns 409", async () => {
        const res = await api.post(`/vendor/orders/action/${orderId}`, {
          action: "fulfill",
        }, {
          headers: vendor.headers,
          validateStatus: () => true,
        })

        expect(res.status).toBe(409)
        expect(res.data.message).toMatch(/already.*accepted/i)
      })

      test("GET /vendor/orders/action/:id returns current action status", async () => {
        const res = await api.get(`/vendor/orders/action/${orderId}`, {
          headers: vendor.headers,
          validateStatus: () => true,
        })

        expect(res.status).toBe(200)
        expect(res.data.order_id).toBe(orderId)
        expect(res.data.vendor_action).toBeDefined()
        expect(res.data.vendor_action.action).toBe("accept")
        expect(res.data.order_status).toBeDefined()
        expect(res.data.fulfillment_status).toBeDefined()
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST: Vendor tracking endpoints — Positive & Negative
    // ═════════════════════════════════════════════════════════════════════

    describe("POST /vendor/orders/fulfill/:id — Tracking", () => {
      test("returns 400 when tracking_code is missing", async () => {
        const res = await api.post(`/vendor/orders/fulfill/${orderId}`, {
          carrier: "UPS",
        }, {
          headers: vendor.headers,
          validateStatus: () => true,
        })

        expect(res.status).toBe(400)
        expect(res.data.message).toMatch(/tracking_code/i)
      })

      test("Vendor can add tracking info to their order", async () => {
        const res = await api.post(`/vendor/orders/fulfill/${orderId}`, {
          tracking_code: "1Z999AA10123456784",
          carrier: "UPS",
          tracking_url: "https://www.ups.com/track?num=1Z999AA10123456784",
        }, {
          headers: vendor.headers,
          validateStatus: () => true,
        })

        expect(res.status).toBe(200)
        expect(res.data.message).toMatch(/tracking.*added/i)
        expect(res.data.tracking).toBeDefined()
        expect(res.data.tracking.tracking_code).toBe("1Z999AA10123456784")
        expect(res.data.tracking.carrier).toBe("UPS")
      })

      test("Vendor can retrieve tracking info via GET", async () => {
        const res = await api.get(`/vendor/orders/fulfill/${orderId}`, {
          headers: vendor.headers,
          validateStatus: () => true,
        })

        expect(res.status).toBe(200)
        expect(res.data.tracking).toBeDefined()
        expect(res.data.tracking.tracking_code).toBe("1Z999AA10123456784")
        expect(res.data.tracking.carrier).toBe("UPS")
        expect(res.data.fulfillment_status).toBeDefined()
      })

      test("Vendor B cannot see Vendor A's tracking info", async () => {
        const res = await api.get(`/vendor/orders/fulfill/${orderId}`, {
          headers: vendorB.headers,
          validateStatus: () => true,
        })

        expect(res.status).toBe(404)
        expect(res.data.message).toMatch(/no vendor items/i)
      })
    })
  },
})
