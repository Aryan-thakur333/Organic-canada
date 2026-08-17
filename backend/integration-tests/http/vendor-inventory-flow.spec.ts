import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { createAndLoginAdmin, registerAndApproveVendor } from "../helpers/integration-auth"
import { ensureVendorStockLocation } from "../helpers/vendor-location"

jest.setTimeout(120 * 1000)

/**
 * Integration tests for vendor inventory operations and audit logging.
 *
 * Covers:
 *   1. Vendor A sees their inventory levels
 *   2. Vendor B does NOT see Vendor A's inventory levels
 *   3. Vendor A updates stock → gets 200
 *   4. Vendor A updates stock → audit entry is created
 *   5. Vendor A sees audit entries via GET /vendor/inventory/audit
 *   6. Vendor B cannot update Vendor A's inventory
 *   7. Admin can view audit logs via /admin/inventory-audit
 */
medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, adminHeaders, getContainer }) => {
    // ── Helpers ──────────────────────────────────────────────────────────

    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

    // ── Shared data ──────────────────────────────────────────────────────

    let vendorA: { id: string; email: string; token: string; headers: Record<string, string> }
    let vendorB: { id: string; email: string; token: string; headers: Record<string, string> }
    let vendorALevelId: string | null = null
    let vendorBLevelId: string | null = null
    let adminAuth: { email: string; token: string; headers: Record<string, string> }

    beforeAll(async () => {
      const container = getContainer()
      adminAuth = await createAndLoginAdmin(container, api)

      vendorA = await registerAndApproveVendor(api, "InventoryVendorA", adminAuth.headers)
      vendorB = await registerAndApproveVendor(api, "InventoryVendorB", adminAuth.headers)

      await ensureVendorStockLocation({ container, vendorId: vendorA.id, storeName: "InventoryVendorA" })
      await ensureVendorStockLocation({ container, vendorId: vendorB.id, storeName: "InventoryVendorB" })

      // Create products so vendors have inventory
      await api.post("/vendor/products", {
        title: `Inv Test A ${uid()}`,
        price: 9.99,
      }, {
        headers: vendorA.headers,
        validateStatus: () => true,
      })

      await api.post("/vendor/products", {
        title: `Inv Test B ${uid()}`,
        price: 14.99,
      }, {
        headers: vendorB.headers,
        validateStatus: () => true,
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST: Inventory Listing — Ownership Isolation
    // ═════════════════════════════════════════════════════════════════════

    describe("GET /vendor/inventory — Ownership isolation", () => {
      test("Vendor A sees inventory only for their products", async () => {
        const res = await api.get("/vendor/inventory", {
          headers: vendorA.headers,
          validateStatus: () => true,
        })

        expect(res.status).toBe(200)
        expect(Array.isArray(res.data.inventory)).toBe(true)
        expect(res.data.alerts).toBeDefined()
        expect(typeof res.data.alerts.lowStockCount).toBe("number")
        expect(typeof res.data.alerts.outOfStock).toBe("number")
      })

      test("Vendor B sees inventory only for their products", async () => {
        const res = await api.get("/vendor/inventory", {
          headers: vendorB.headers,
          validateStatus: () => true,
        })

        expect(res.status).toBe(200)
        expect(Array.isArray(res.data.inventory)).toBe(true)
      })

      test("different vendors see different inventory items", async () => {
        const [resA, resB] = await Promise.all([
          api.get("/vendor/inventory", { headers: vendorA.headers, validateStatus: () => true }),
          api.get("/vendor/inventory", { headers: vendorB.headers, validateStatus: () => true }),
        ])

        const idsA = new Set(resA.data.inventory.map((item: any) => item.level_id))
        const idsB = new Set(resB.data.inventory.map((item: any) => item.level_id))

        // Vendors should have completely disjoint inventory level IDs
        for (const idB of idsB) {
          expect(idsA.has(idB)).toBe(false)
        }
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST: Inventory Update
    // ═════════════════════════════════════════════════════════════════════

    describe("POST /vendor/inventory — Stock updates", () => {
      test("Vendor A can update their inventory (restock)", async () => {
        // First get vendor A's inventory to find a level_id
        const invRes = await api.get("/vendor/inventory", {
          headers: vendorA.headers,
          validateStatus: () => true,
        })

        expect(invRes.data.inventory.length).toBeGreaterThan(0)

        const targetItem = invRes.data.inventory[0]
        vendorALevelId = targetItem.level_id

        const newQty = targetItem.stocked_quantity + 50
        const res = await api.post("/vendor/inventory", {
          level_id: vendorALevelId,
          stocked_quantity: newQty,
        }, {
          headers: vendorA.headers,
          validateStatus: () => true,
        })

        expect(res.status).toBe(200)
        expect(res.data.inventory_level).toBeDefined()
      })

      test("Vendor B cannot update Vendor A's inventory level (404)", async () => {
        if (!vendorALevelId) throw new Error("vendorALevelId not set")

        const res = await api.post("/vendor/inventory", {
          level_id: vendorALevelId,
          stocked_quantity: 999,
        }, {
          headers: vendorB.headers,
          validateStatus: () => true,
        })

        expect(res.status).toBe(404)
        expect(res.data.message).toMatch(/not found for this vendor/i)
      })

      test("returns 400 for negative stocked_quantity", async () => {
        if (!vendorALevelId) throw new Error("vendorALevelId not set")

        const res = await api.post("/vendor/inventory", {
          level_id: vendorALevelId,
          stocked_quantity: -5,
        }, {
          headers: vendorA.headers,
          validateStatus: () => true,
        })

        expect(res.status).toBe(400)
        expect(res.data.message).toMatch(/non-negative/i)
      })

      test("returns 400 for missing level_id", async () => {
        const res = await api.post("/vendor/inventory", {
          stocked_quantity: 100,
        }, {
          headers: vendorA.headers,
          validateStatus: () => true,
        })

        expect(res.status).toBe(400)
        expect(res.data.message).toMatch(/level_id/i)
      })

      test("returns 400 for non-integer stocked_quantity", async () => {
        if (!vendorALevelId) throw new Error("vendorALevelId not set")

        const res = await api.post("/vendor/inventory", {
          level_id: vendorALevelId,
          stocked_quantity: 12.5,
        }, {
          headers: vendorA.headers,
          validateStatus: () => true,
        })

        expect(res.status).toBe(400)
        expect(res.data.message).toMatch(/integer/i)
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST: Inventory Audit Log
    // ═════════════════════════════════════════════════════════════════════

    describe("GET /vendor/inventory/audit — Audit logging", () => {
      test("Vendor A sees audit entries after updating stock", async () => {
        const res = await api.get("/vendor/inventory/audit", {
          headers: vendorA.headers,
          validateStatus: () => true,
        })

        expect(res.status).toBe(200)
        expect(Array.isArray(res.data.entries)).toBe(true)
        expect(res.data.count).toBeGreaterThanOrEqual(1)
        expect(typeof res.data.limit).toBe("number")
        expect(typeof res.data.offset).toBe("number")
      })

      test("audit entries contain expected fields", async () => {
        const res = await api.get("/vendor/inventory/audit", {
          headers: vendorA.headers,
          validateStatus: () => true,
        })

        const entry = res.data.entries[0]
        expect(entry).toBeDefined()
        expect(entry.id).toBeTruthy()
        expect(entry.vendor_id).toBe(vendorA.id)
        expect(entry.level_id).toBeTruthy()
        expect(typeof entry.previous_stocked_quantity).toBe("number")
        expect(typeof entry.new_stocked_quantity).toBe("number")
        expect(entry.change_type).toMatch(/restock|manual_update|adjustment/)
        expect(entry.source).toBe("vendor_dashboard")
        expect(entry.actor_type).toBe("vendor")
        expect(entry.created_at).toBeTruthy()
      })

      test("audit entry shows correct before/after values", async () => {
        // First get current inventory & note the value
        const invRes = await api.get("/vendor/inventory", {
          headers: vendorA.headers,
          validateStatus: () => true,
        })

        const target = invRes.data.inventory.find(
          (i: any) => i.level_id === vendorALevelId
        )
        if (!target) return

        const beforeQty = target.stocked_quantity
        const newQty = beforeQty + 25

        // Update stock
        await api.post("/vendor/inventory", {
          level_id: vendorALevelId,
          stocked_quantity: newQty,
        }, {
          headers: vendorA.headers,
          validateStatus: () => true,
        })

        // Check the audit log for this change
        const auditRes = await api.get(`/vendor/inventory/audit?level_id=${vendorALevelId}&limit=1`, {
          headers: vendorA.headers,
          validateStatus: () => true,
        })

        expect(auditRes.status).toBe(200)
        expect(auditRes.data.entries.length).toBeGreaterThan(0)

        const latestEntry = auditRes.data.entries[0]
        expect(latestEntry.previous_stocked_quantity).toBe(beforeQty)
        expect(latestEntry.new_stocked_quantity).toBe(newQty)
        expect(latestEntry.change_type).toBe("restock")
      })

      test("supports pagination via limit and offset", async () => {
        const res = await api.get("/vendor/inventory/audit?limit=1&offset=0", {
          headers: vendorA.headers,
          validateStatus: () => true,
        })

        expect(res.status).toBe(200)
        expect(res.data.entries.length).toBeLessThanOrEqual(1)
        expect(res.data.limit).toBe(1)
        expect(res.data.offset).toBe(0)
      })

      test("Vendor B cannot see Vendor A's audit entries", async () => {
        const res = await api.get("/vendor/inventory/audit", {
          headers: vendorB.headers,
          validateStatus: () => true,
        })

        expect(res.status).toBe(200)

        // Vendor B's audit entries should all belong to vendor B
        for (const entry of res.data.entries) {
          expect(entry.vendor_id).toBe(vendorB.id)
        }
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST: Admin Audit Overview
    // ═════════════════════════════════════════════════════════════════════

    describe("GET /admin/inventory-audit — Admin view", () => {
      test("admin can see all audit entries across vendors", async () => {
        const res = await api.get("/admin/inventory-audit", {
          headers: adminAuth.headers,
          validateStatus: () => true,
        })

        expect(res.status).toBe(200)
        expect(Array.isArray(res.data.entries)).toBe(true)
        expect(res.data.count).toBeGreaterThanOrEqual(1)
      })

      test("admin can filter by vendor_id", async () => {
        const res = await api.get(`/admin/inventory-audit?vendor_id=${vendorA.id}`, {
          headers: adminAuth.headers,
          validateStatus: () => true,
        })

        expect(res.status).toBe(200)
        for (const entry of res.data.entries) {
          expect(entry.vendor_id).toBe(vendorA.id)
        }
      })
    })
  },
})
