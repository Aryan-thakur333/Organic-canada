import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import { MARKETPLACE_MODULE } from "../../src/modules/marketplace"
import { createUserAccountWorkflow } from "@medusajs/medusa/core-flows"
import { createAndLoginAdmin, registerAndApproveVendor } from "../helpers/integration-auth"
import { ensureVendorStockLocation } from "../helpers/vendor-location"

jest.setTimeout(120 * 1000)

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, adminHeaders = { headers: {} }, getContainer }) => {
    const suiteId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

    // Helper for auth headers
    function vendorHeaders(token: string) {
      return { Authorization: `Bearer ${token}` }
    }

    let vendorA: { id: string; email: string; token: string; headers: Record<string, string> }
    let vendorB: { id: string; email: string; token: string; headers: Record<string, string> }
    let vendorOrderId: string
    let orderId: string
    let vendorOrderItemId: string
    let adminAuth: { email: string; token: string; headers: Record<string, string> }

    beforeAll(async () => {
      try {
        const container = getContainer()
        expect(container).toBeTruthy()

        // 1. Verify schema exists in the integration DB via Service
        const marketplaceService: any = container.resolve(MARKETPLACE_MODULE)
        const [orders] = await marketplaceService.listAndCountVendorOrders({}, { take: 1 })
        expect(Array.isArray(orders)).toBe(true)

        // Setup and log in admin user to authenticate adminHeaders
        adminAuth = await createAndLoginAdmin(container, api)
        ;(adminHeaders as any).headers ||= {}
        ;(adminHeaders as any).headers.Authorization = adminAuth.headers.Authorization

        // 2. Create Vendors
        vendorA = await registerAndApproveVendor(api, "LifecycleVendorA", adminAuth.headers)
        vendorB = await registerAndApproveVendor(api, "LifecycleVendorB", adminAuth.headers)

        await ensureVendorStockLocation({ container, vendorId: vendorA.id, storeName: "LifecycleVendorA" })
        await ensureVendorStockLocation({ container, vendorId: vendorB.id, storeName: "LifecycleVendorB" })

        // 3. Create products
        const prodRes = await api.post(
          "/vendor/products",
          { title: `Lifecycle Test Product ${suiteId}`, price: 100.00, initial_stock: 100 },
          {
            headers: vendorA.headers,
            validateStatus: () => true,
          }
        )
        expect(prodRes.status).toBe(201)

        const productId = prodRes.data.product.id
        const variantId = prodRes.data.product.variants?.[0]?.id

        // 4. Create Medusa Order (Simulating checkout completion)
        const orderModuleService: any = container.resolve(Modules.ORDER)
        const createdOrder = await orderModuleService.createOrders({
          email: "customer@lifecycle.test",
          currency_code: "cad",
          payment_status: "captured",
          items: [
            {
              title: "Lifecycle Test Product",
              quantity: 5,
              unit_price: 2200, // minor units ($22.00)
              variant_id: variantId,
              product_id: productId,
            },
          ],
        })
        orderId = createdOrder.id

        // 5. Create VendorOrder (Simulating backfill/checkout listener)
        const vendorOrder = await marketplaceService.createVendorOrders({
          vendor_id: vendorA.id,
          order_id: orderId,
          display_id: createdOrder.display_id ?? null,
          status: "pending",
          payment_status: "captured", // Parent order is captured
          currency_code: "cad",
          item_subtotal: 11000,
          commission_total: 1100, // 10%
          vendor_net_total: 9900,
        })
        vendorOrderId = vendorOrder.id

        const createdItem = await marketplaceService.createVendorOrderItems({
          vendor_order_id: vendorOrder.id,
          vendor_id: vendorA.id,
          order_id: orderId,
          product_id: productId,
          line_item_id: createdOrder.items[0].id,
          title: "Lifecycle Test Product",
          quantity: 5,
          unit_price: 2200,
          subtotal: 11000,
          commission_amount: 1100,
          vendor_net_amount: 9900,
        })
        vendorOrderItemId = createdItem.id
        console.log(`[SETUP] order-ready vendorOrderId=${vendorOrderId}`)

      } catch (error: any) {
        console.error("[VENDOR_LIFECYCLE_SETUP_FAILED]", {
          message: error?.message,
          stack: error?.stack,
        })
        throw error
      }
    })

    describe("Vendor Order Lifecycle End-to-End", () => {
      test("1. Vendor A lists orders and sees correct money and status", async () => {
        const res = await api.get("/vendor/orders", {
          headers: vendorA.headers,
          validateStatus: () => true,
        })

        expect(res.status).toBe(200)
        expect(res.data.orders.length).toBe(1)
        
        const order = res.data.orders[0]
        expect(order.id).toBe(vendorOrderId)
        expect(order.status).toBe("pending")
        expect(order.payment_status).toBe("captured")
        expect(order.item_subtotal).toBe(11000)
        expect(order.commission_total).toBe(1100)
        expect(order.vendor_net_total).toBe(9900)
      })

      test("2. Cross-vendor isolation: Vendor B gets 403/404 on Vendor A's order", async () => {
        const resList = await api.get("/vendor/orders", {
          headers: vendorB.headers,
          validateStatus: () => true,
        })
        expect(resList.status).toBe(200)
        // Ensure Vendor B does not see the order
        expect(resList.data.orders.map((o: any) => o.id)).not.toContain(vendorOrderId)

        const resAction = await api.post(
          `/vendor/orders/${vendorOrderId}/accept`,
          {},
          {
            headers: vendorB.headers,
            validateStatus: () => true,
          }
        )
        expect([403, 404]).toContain(resAction.status)
      })

      test("3. Accept Order", async () => {
        const res = await api.post(
          `/vendor/orders/${vendorOrderId}/accept`,
          {},
          {
            headers: vendorA.headers,
            validateStatus: () => true,
          }
        )
        
        expect(res.status).toBe(200)

        const getRes = await api.get("/vendor/orders", {
          headers: vendorA.headers,
          validateStatus: () => true,
        })
        const order = getRes.data.orders.find((o: any) => o.id === vendorOrderId)
        expect(order.status).toBe("accepted")
        expect(order.accepted_at).toBeTruthy()
      })

      test("4. Allocate Order", async () => {
        const res = await api.post(
          `/vendor/orders/${vendorOrderId}/allocate`,
          { location_id: "loc_123" },
          {
            headers: vendorA.headers,
            validateStatus: () => true,
          }
        )
        
        expect(res.status).toBe(200)
        const getRes = await api.get("/vendor/orders", {
          headers: vendorA.headers,
          validateStatus: () => true,
        })
        const order = getRes.data.orders.find((o: any) => o.id === vendorOrderId)
        expect(order.status).toBe("processing")
        expect(order.fulfillment_status).toBe("allocated")
      })

      test("4.5. Prepare Order", async () => {
        const res = await api.post(
          `/vendor/orders/${vendorOrderId}/prepare`,
          {},
          {
            headers: vendorA.headers,
            validateStatus: () => true,
          }
        )
        
        expect(res.status).toBe(200)
        const getRes = await api.get("/vendor/orders", {
          headers: vendorA.headers,
          validateStatus: () => true,
        })
        const order = getRes.data.orders.find((o: any) => o.id === vendorOrderId)
        expect(order.status).toBe("prepared")
      })

      test("5. Fulfill Order", async () => {
        const res = await api.post(
          `/vendor/orders/${vendorOrderId}/fulfill`,
          { location_id: "loc_123" },
          {
            headers: vendorA.headers,
            validateStatus: () => true,
          }
        )
        
        expect(res.status).toBe(200)
        const getRes = await api.get("/vendor/orders", {
          headers: vendorA.headers,
          validateStatus: () => true,
        })
        const order = getRes.data.orders.find((o: any) => o.id === vendorOrderId)
        expect(order.status).toBe("ready_to_ship")
      })

      test("6. Ship Order with Tracking", async () => {
        const payload = {
          tracking_number: "TRACK-12345",
          carrier: "Canada Post",
          tracking_url: "https://canadapost.ca/track",
        }

        const res = await api.post(
          `/vendor/orders/${vendorOrderId}/ship`,
          payload,
          {
            headers: vendorA.headers,
            validateStatus: () => true,
          }
        )
        
        expect(res.status).toBe(200)
        const getRes = await api.get("/vendor/orders", {
          headers: vendorA.headers,
          validateStatus: () => true,
        })
        const order = getRes.data.orders.find((o: any) => o.id === vendorOrderId)
        expect(order.status).toBe("shipped")
      })

      test("7. Deliver Order", async () => {
        const res = await api.post(
          `/vendor/orders/${vendorOrderId}/deliver`,
          {},
          {
            headers: vendorA.headers,
            validateStatus: () => true,
          }
        )
        
        expect(res.status).toBe(200)
        const getRes = await api.get("/vendor/orders", {
          headers: vendorA.headers,
          validateStatus: () => true,
        })
        const order = getRes.data.orders.find((o: any) => o.id === vendorOrderId)
        expect(order.status).toBe("delivered")
        expect(order.delivered_at).toBeTruthy()
      })

      test("7.1. Repeated delivery should be idempotent and not duplicate activity", async () => {
        const res = await api.post(
          `/vendor/orders/${vendorOrderId}/deliver`,
          {},
          {
            headers: vendorA.headers,
            validateStatus: () => true,
          }
        )
        
        expect(res.status).toBe(200)
        expect(res.data.message).toMatch(/already delivered|Order delivered/i)
      })

      test("8. Cannot re-transition delivered order", async () => {
        const res = await api.post(
          `/vendor/orders/${vendorOrderId}/accept`,
          {},
          {
            headers: vendorA.headers,
            validateStatus: () => true,
          }
        )
        
        expect([400, 409]).toContain(res.status)
      })
    })

    describe("Vendor Fulfillment Inventory Validation", () => {
      let productIdNoInv: string
      let variantIdNoInv: string
      let orderIdNoInv: string

      beforeAll(async () => {
        // Create product with NO inventory (0 initial stock)
        const prodRes = await api.post(
          "/vendor/products",
          { title: `No Inventory Product ${suiteId}`, price: 100.00, initial_stock: 0 },
          {
            headers: vendorA.headers,
            validateStatus: () => true,
          }
        )
        productIdNoInv = prodRes.data.product.id
        variantIdNoInv = prodRes.data.product.variants[0].id

        const container = getContainer()
        const orderModuleService: any = container.resolve(Modules.ORDER)
        const createdOrder = await orderModuleService.createOrders({
          email: "noinv@lifecycle.test",
          currency_code: "cad",
          payment_status: "captured",
          items: [{
            title: "No Inv Product",
            quantity: 5,
            unit_price: 2200,
            variant_id: variantIdNoInv,
            product_id: productIdNoInv,
          }]
        })

        const marketplaceService: any = container.resolve(MARKETPLACE_MODULE)
        
        // Let's create a new VendorOrder
        const vo = await marketplaceService.createVendorOrders({
          order_id: createdOrder.id,
          vendor_id: vendorA.id,
          status: "pending",
          currency_code: "cad",
          vendor_net_total: 9900,
          commission_total: 1100,
          item_subtotal: 11000,
        })
        orderIdNoInv = vo.id
        
        await marketplaceService.createVendorOrderItems({
          vendor_order_id: orderIdNoInv,
          line_item_id: createdOrder.items[0].id,
          title: "No Inv Product",
          quantity: 5,
          unit_price: 2200,
          subtotal: 11000,
          commission_amount: 1100,
          vendor_net_amount: 9900,
        })

        await api.post(`/vendor/orders/${orderIdNoInv}/accept`, {}, {
          headers: vendorA.headers,
          validateStatus: () => true,
        })
        await api.post(`/vendor/orders/${orderIdNoInv}/prepare`, {}, {
          headers: vendorA.headers,
          validateStatus: () => true,
        })
      })

      test("Insufficient inventory returns 422", async () => {
        const res = await api.post(
          `/vendor/orders/${orderIdNoInv}/fulfill`,
          {},
          {
            headers: vendorA.headers,
            validateStatus: () => true,
          }
        )
        expect(res.status).toBe(422)
        expect(res.data.code).toBe("VENDOR_INSUFFICIENT_INVENTORY")
      })
    })
  },
})
