import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { splitOrderWorkflow } from "../../src/workflows/split-order-workflow"
import type { SplitOrderWorkflowInput } from "../../src/workflows/split-order-workflow"

jest.setTimeout(120 * 1000)

/**
 * Integration tests for the multi-vendor split-order workflow.
 *
 * Covers:
 *   1. SplitOrderWorkflow splits items from 2 vendors into 2 buckets
 *   2. SplitOrderWorkflow groups same-vendor items into one bucket
 *   3. SplitOrderWorkflow marks items without a vendor as unlinked
 *   4. SplitOrderWorkflow handles empty items array gracefully
 *   5. SplitOrderWorkflow computes correct totals per bucket
 */
medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, adminHeaders, container }) => {
    // ── Helpers ──────────────────────────────────────────────────────────

    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

    async function registerAndApproveVendor(storeName: string) {
      const email = `split-vendor-${storeName}-${uid()}@eatsie.test`
      const regRes = await api.post("/vendor/register").send({
        name: storeName,
        store_name: storeName,
        email,
        password: "SplitVendor123!",
      })
      const vendorId = regRes.body.vendor.id

      await api
        .post(`/admin/vendors/${vendorId}/approve`)
        .set(adminHeaders.headers)
        .expect(200)

      const loginRes = await api.post("/vendor/login").send({ email, password: "SplitVendor123!" })
      return { id: vendorId, email: loginRes.body.vendor.email, token: loginRes.body.token }
    }

    const vendorAuth = (token: string) => ({ Authorization: `Bearer ${token}` })

    // ── Shared data ──────────────────────────────────────────────────────

    let vendorA: { id: string; email: string; token: string }
    let vendorB: { id: string; email: string; token: string }
    let vendorAProductId: string
    let vendorAVariantId: string
    let vendorBProductId: string
    let vendorBVariantId: string

    beforeAll(async () => {
      vendorA = await registerAndApproveVendor("SplitVendorA")
      vendorB = await registerAndApproveVendor("SplitVendorB")

      // Create products for both vendors
      const prodResA = await api
        .post("/vendor/products")
        .set(vendorAuth(vendorA.token))
        .send({ title: `Split Test A ${uid()}`, price: 19.99 })
      vendorAProductId = prodResA.body.product.id
      vendorAVariantId = prodResA.body.product.variants?.[0]?.id

      const prodResB = await api
        .post("/vendor/products")
        .set(vendorAuth(vendorB.token))
        .send({ title: `Split Test B ${uid()}`, price: 29.99 })
      vendorBProductId = prodResB.body.product.id
      vendorBVariantId = prodResB.body.product.variants?.[0]?.id
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST: Split items from 2 vendors into 2 buckets
    // ═════════════════════════════════════════════════════════════════════

    describe("splitOrderWorkflow — Multi-vendor split", () => {
      test("splits items from 2 vendors into 2 buckets", async () => {
        const input: SplitOrderWorkflowInput = {
          orderId: `test-order-${uid()}`,
          currency_code: "usd",
          items: [
            { id: "li_1", product_id: vendorAProductId, title: "Item A", quantity: 2, unit_price: 1999, thumbnail: null },
            { id: "li_2", product_id: vendorBProductId, title: "Item B", quantity: 1, unit_price: 2999, thumbnail: null },
          ],
        }

        const { result } = await splitOrderWorkflow(container).run({ input })

        expect(result.vendor_count).toBe(2)
        expect(result.buckets).toHaveLength(2)
        expect(result.unlinked_items).toHaveLength(0)
      })

      test("groups same-vendor items into a single bucket", async () => {
        const input: SplitOrderWorkflowInput = {
          orderId: `test-order-${uid()}`,
          currency_code: "usd",
          items: [
            { id: "li_a1", product_id: vendorAProductId, title: "Item A1", quantity: 1, unit_price: 1999, thumbnail: null },
            { id: "li_a2", product_id: vendorAProductId, title: "Item A2", quantity: 3, unit_price: 999, thumbnail: null },
            { id: "li_b1", product_id: vendorBProductId, title: "Item B1", quantity: 2, unit_price: 2999, thumbnail: null },
          ],
        }

        const { result } = await splitOrderWorkflow(container).run({ input })

        expect(result.vendor_count).toBe(2)
        expect(result.buckets).toHaveLength(2)

        const bucketA = result.buckets.find((b) => b.vendor_id === vendorA.id)
        const bucketB = result.buckets.find((b) => b.vendor_id === vendorB.id)

        expect(bucketA).toBeDefined()
        expect(bucketB).toBeDefined()
        expect(bucketA!.items).toHaveLength(2)
        expect(bucketB!.items).toHaveLength(1)
      })

      test("computes correct totals per bucket", async () => {
        const input: SplitOrderWorkflowInput = {
          orderId: `test-order-${uid()}`,
          currency_code: "usd",
          items: [
            { id: "li_1", product_id: vendorAProductId, title: "Item A", quantity: 2, unit_price: 1999, thumbnail: null },
            { id: "li_2", product_id: vendorBProductId, title: "Item B", quantity: 3, unit_price: 2999, thumbnail: null },
          ],
        }

        const { result } = await splitOrderWorkflow(container).run({ input })

        const bucketA = result.buckets.find((b) => b.vendor_id === vendorA.id)
        const bucketB = result.buckets.find((b) => b.vendor_id === vendorB.id)

        // 2 × 1999 = 3998 cents
        expect(bucketA!.total).toBe(3998)
        expect(bucketA!.item_count).toBe(2)

        // 3 × 2999 = 8997 cents
        expect(bucketB!.total).toBe(8997)
        expect(bucketB!.item_count).toBe(3)
      })

      test("enriches buckets with currency_code", async () => {
        const input: SplitOrderWorkflowInput = {
          orderId: `test-order-${uid()}`,
          currency_code: "cad",
          items: [
            { id: "li_1", product_id: vendorAProductId, title: "Item A", quantity: 1, unit_price: 1500, thumbnail: null },
          ],
        }

        const { result } = await splitOrderWorkflow(container).run({ input })
        expect(result.buckets[0].currency_code).toBe("cad")
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST: Unlinked items (no vendor)
    // ═════════════════════════════════════════════════════════════════════

    describe("splitOrderWorkflow — Unlinked items", () => {
      test("marks items without a vendor as unlinked", async () => {
        const input: SplitOrderWorkflowInput = {
          orderId: `test-order-${uid()}`,
          currency_code: "usd",
          items: [
            { id: "li_1", product_id: "non-existent-product", title: "Orphan Item", quantity: 1, unit_price: 999, thumbnail: null },
            { id: "li_2", product_id: vendorAProductId, title: "Valid Item", quantity: 1, unit_price: 1999, thumbnail: null },
          ],
        }

        const { result } = await splitOrderWorkflow(container).run({ input })

        expect(result.unlinked_items).toHaveLength(1)
        expect(result.unlinked_items[0].product_id).toBe("non-existent-product")
        expect(result.unlinked_items[0].vendor_id).toBeNull()
        expect(result.vendor_count).toBe(1)
      })

      test("handles all items unlinked gracefully", async () => {
        const input: SplitOrderWorkflowInput = {
          orderId: `test-order-${uid()}`,
          currency_code: "usd",
          items: [
            { id: "li_1", product_id: "unknown-1", title: "Ghost Item 1", quantity: 1, unit_price: 999, thumbnail: null },
            { id: "li_2", product_id: "unknown-2", title: "Ghost Item 2", quantity: 2, unit_price: 499, thumbnail: null },
          ],
        }

        const { result } = await splitOrderWorkflow(container).run({ input })

        expect(result.vendor_count).toBe(0)
        expect(result.buckets).toHaveLength(0)
        expect(result.unlinked_items).toHaveLength(2)
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST: Edge cases
    // ═════════════════════════════════════════════════════════════════════

    describe("splitOrderWorkflow — Edge cases", () => {
      test("handles empty items array", async () => {
        const input: SplitOrderWorkflowInput = {
          orderId: `test-order-${uid()}`,
          currency_code: "usd",
          items: [],
        }

        const { result } = await splitOrderWorkflow(container).run({ input })

        expect(result.vendor_count).toBe(0)
        expect(result.buckets).toHaveLength(0)
        expect(result.unlinked_items).toHaveLength(0)
      })

      test("handles single vendor order correctly", async () => {
        const input: SplitOrderWorkflowInput = {
          orderId: `test-order-${uid()}`,
          currency_code: "usd",
          items: [
            { id: "li_1", product_id: vendorAProductId, title: "Item A", quantity: 1, unit_price: 1999, thumbnail: null },
            { id: "li_2", product_id: vendorAProductId, title: "Item A2", quantity: 2, unit_price: 999, thumbnail: null },
          ],
        }

        const { result } = await splitOrderWorkflow(container).run({ input })

        expect(result.vendor_count).toBe(1)
        expect(result.buckets).toHaveLength(1)
        expect(result.buckets[0].vendor_id).toBe(vendorA.id)
      })

      test("bucket output has consistent shape", async () => {
        const input: SplitOrderWorkflowInput = {
          orderId: `test-order-${uid()}`,
          currency_code: "eur",
          items: [
            { id: "li_1", product_id: vendorAProductId, title: "Item A", quantity: 1, unit_price: 1000, thumbnail: null },
            { id: "li_2", product_id: vendorBProductId, title: "Item B", quantity: 1, unit_price: 2000, thumbnail: null },
          ],
        }

        const { result } = await splitOrderWorkflow(container).run({ input })

        // Verify each bucket has all expected fields
        for (const bucket of result.buckets) {
          expect(bucket).toHaveProperty("vendor_id")
          expect(bucket).toHaveProperty("items")
          expect(bucket).toHaveProperty("item_count")
          expect(bucket).toHaveProperty("total")
          expect(bucket).toHaveProperty("currency_code")

          expect(Array.isArray(bucket.items)).toBe(true)
          expect(typeof bucket.item_count).toBe("number")
          expect(typeof bucket.total).toBe("number")
          expect(typeof bucket.currency_code).toBe("string")

          // Each item should have required fields
          for (const item of bucket.items) {
            expect(item).toHaveProperty("line_item_id")
            expect(item).toHaveProperty("product_id")
            expect(item).toHaveProperty("vendor_id")
            expect(item).toHaveProperty("quantity")
            expect(item).toHaveProperty("unit_price")
          }
        }

        // Verify output shape
        expect(result).toHaveProperty("orderId")
        expect(result).toHaveProperty("buckets")
        expect(result).toHaveProperty("unlinked_items")
        expect(result).toHaveProperty("vendor_count")
      })
    })
  },
})
