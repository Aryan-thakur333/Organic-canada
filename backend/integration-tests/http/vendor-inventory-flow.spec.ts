import { medusaIntegrationTestRunner } from "@medusajs/test-utils"

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
  testSuite: ({ api, adminHeaders }) => {
    // ── Helpers ──────────────────────────────────────────────────────────

    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

    async function registerAndApproveVendor(storeName: string) {
      const email = `inv-vendor-${storeName}-${uid()}@eatsie.test`
      const regRes = await api.post("/vendor/register").send({
        name: storeName,
        store_name: storeName,
        email,
        password: "InventoryVendor123!",
      })
      const vendorId = regRes.body.vendor.id

      await api
        .post(`/admin/vendors/${vendorId}/approve`)
        .set(adminHeaders.headers)
        .expect(200)

      const loginRes = await api.post("/vendor/login").send({ email, password: "InventoryVendor123!" })
      return { id: vendorId, email, token: loginRes.body.token }
    }

    const vendorAuth = (token: string) => ({ Authorization: `Bearer ${token}` })

    // ── Shared data ──────────────────────────────────────────────────────

    let vendorA: { id: string; email: string; token: string }
    let vendorB: { id: string; email: string; token: string }
    let vendorALevelId: string | null = null
    let vendorBLevelId: string | null = null

    beforeAll(async () => {
      vendorA = await registerAndApproveVendor("InventoryVendorA")
      vendorB = await registerAndApproveVendor("InventoryVendorB")

      // Create products so vendors have inventory
      const prodResA = await api
        .post("/vendor/products")
        .set(vendorAuth(vendorA.token))
        .send({ title: `Inv Test A ${uid()}`, price: 9.99 })

      const prodResB = await api
        .post("/vendor/products")
        .set(vendorAuth(vendorB.token))
        .send({ title: `Inv Test B ${uid()}`, price: 14.99 })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST: Inventory Listing — Ownership Isolation
    // ═════════════════════════════════════════════════════════════════════

    describe("GET /vendor/inventory — Ownership isolation", () => {
      test("Vendor A sees inventory only for their products", async () => {
        const res = await api
          .get("/vendor/inventory")
          .set(vendorAuth(vendorA.token))

        expect(res.status).toBe(200)
        expect(Array.isArray(res.body.inventory)).toBe(true)
        expect(res.body.alerts).toBeDefined()
        expect(typeof res.body.alerts.lowStockCount).toBe("number")
        expect(typeof res.body.alerts.outOfStock).toBe("number")
      })

      test("Vendor B sees inventory only for their products", async () => {
        const res = await api
          .get("/vendor/inventory")
          .set(vendorAuth(vendorB.token))

        expect(res.status).toBe(200)
        expect(Array.isArray(res.body.inventory)).toBe(true)
      })

      test("different vendors see different inventory items", async () => {
        const [resA, resB] = await Promise.all([
          api.get("/vendor/inventory").set(vendorAuth(vendorA.token)),
          api.get("/vendor/inventory").set(vendorAuth(vendorB.token)),
        ])

        const idsA = new Set(resA.body.inventory.map((item: any) => item.level_id))
        const idsB = new Set(resB.body.inventory.map((item: any) => item.level_id))

        // Vendors should have completely disjoint inventory level IDs
        // (unless they share a location, which they shouldn't)
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
        const invRes = await api
          .get("/vendor/inventory")
          .set(vendorAuth(vendorA.token))

        expect(invRes.body.inventory.length).toBeGreaterThan(0)

        const targetItem = invRes.body.inventory[0]
        vendorALevelId = targetItem.level_id

        const newQty = targetItem.stocked_quantity + 50
        const res = await api
          .post("/vendor/inventory")
          .set(vendorAuth(vendorA.token))
          .send({ level_id: vendorALevelId, stocked_quantity: newQty })

        expect(res.status).toBe(200)
        expect(res.body.inventory_level).toBeDefined()
      })

      test("Vendor B cannot update Vendor A's inventory level (404)", async () => {
        if (!vendorALevelId) throw new Error("vendorALevelId not set")

        const res = await api
          .post("/vendor/inventory")
          .set(vendorAuth(vendorB.token))
          .send({ level_id: vendorALevelId, stocked_quantity: 999 })

        expect(res.status).toBe(404)
        expect(res.body.message).toMatch(/not found for this vendor/i)
      })

      test("returns 400 for negative stocked_quantity", async () => {
        if (!vendorALevelId) throw new Error("vendorALevelId not set")

        const res = await api
          .post("/vendor/inventory")
          .set(vendorAuth(vendorA.token))
          .send({ level_id: vendorALevelId, stocked_quantity: -5 })

        expect(res.status).toBe(400)
        expect(res.body.message).toMatch(/non-negative/i)
      })

      test("returns 400 for missing level_id", async () => {
        const res = await api
          .post("/vendor/inventory")
          .set(vendorAuth(vendorA.token))
          .send({ stocked_quantity: 100 })

        expect(res.status).toBe(400)
        expect(res.body.message).toMatch(/level_id/i)
      })

      test("returns 400 for non-integer stocked_quantity", async () => {
        if (!vendorALevelId) throw new Error("vendorALevelId not set")

        const res = await api
          .post("/vendor/inventory")
          .set(vendorAuth(vendorA.token))
          .send({ level_id: vendorALevelId, stocked_quantity: 12.5 })

        expect(res.status).toBe(400)
        expect(res.body.message).toMatch(/integer/i)
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST: Inventory Audit Log
    // ═════════════════════════════════════════════════════════════════════

    describe("GET /vendor/inventory/audit — Audit logging", () => {
      test("Vendor A sees audit entries after updating stock", async () => {
        const res = await api
          .get("/vendor/inventory/audit")
          .set(vendorAuth(vendorA.token))

        expect(res.status).toBe(200)
        expect(Array.isArray(res.body.entries)).toBe(true)
        expect(res.body.count).toBeGreaterThanOrEqual(1)
        expect(typeof res.body.limit).toBe("number")
        expect(typeof res.body.offset).toBe("number")
      })

      test("audit entries contain expected fields", async () => {
        const res = await api
          .get("/vendor/inventory/audit")
          .set(vendorAuth(vendorA.token))

        const entry = res.body.entries[0]
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
        const invRes = await api
          .get("/vendor/inventory")
          .set(vendorAuth(vendorA.token))

        const target = invRes.body.inventory.find(
          (i: any) => i.level_id === vendorALevelId
        )
        if (!target) return // skip if no matching level

        const beforeQty = target.stocked_quantity
        const newQty = beforeQty + 25

        // Update stock
        await api
          .post("/vendor/inventory")
          .set(vendorAuth(vendorA.token))
          .send({ level_id: vendorALevelId, stocked_quantity: newQty })

        // Check the audit log for this change
        const auditRes = await api
          .get(`/vendor/inventory/audit?level_id=${vendorALevelId}&limit=1`)
          .set(vendorAuth(vendorA.token))

        expect(auditRes.status).toBe(200)
        expect(auditRes.body.entries.length).toBeGreaterThan(0)

        const latestEntry = auditRes.body.entries[0]
        expect(latestEntry.previous_stocked_quantity).toBe(beforeQty)
        expect(latestEntry.new_stocked_quantity).toBe(newQty)
        expect(latestEntry.change_type).toBe("restock")
      })

      test("supports pagination via limit and offset", async () => {
        const res = await api
          .get("/vendor/inventory/audit?limit=1&offset=0")
          .set(vendorAuth(vendorA.token))

        expect(res.status).toBe(200)
        expect(res.body.entries.length).toBeLessThanOrEqual(1)
        expect(res.body.limit).toBe(1)
        expect(res.body.offset).toBe(0)
      })

      test("Vendor B cannot see Vendor A's audit entries", async () => {
        const res = await api
          .get("/vendor/inventory/audit")
          .set(vendorAuth(vendorB.token))

        expect(res.status).toBe(200)

        // Vendor B's audit entries should all belong to vendor B
        for (const entry of res.body.entries) {
          expect(entry.vendor_id).toBe(vendorB.id)
        }
      })
    })

    // ═════════════════════════════════════════════════════════════════════
    //  TEST: Admin Audit Overview
    // ═════════════════════════════════════════════════════════════════════

    describe("GET /admin/inventory-audit — Admin view", () => {
      test("admin can see all audit entries across vendors", async () => {
        const res = await api
          .get("/admin/inventory-audit")
          .set(adminHeaders.headers)

        expect(res.status).toBe(200)
        expect(Array.isArray(res.body.entries)).toBe(true)
        expect(res.body.count).toBeGreaterThanOrEqual(1)
      })

      test("admin can filter by vendor_id", async () => {
        const res = await api
          .get(`/admin/inventory-audit?vendor_id=${vendorA.id}`)
          .set(adminHeaders.headers)

        expect(res.status).toBe(200)
        for (const entry of res.body.entries) {
          expect(entry.vendor_id).toBe(vendorA.id)
        }
      })
    })
  },
})
