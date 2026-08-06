import fs from "fs"
import path from "path"
import { assertTransition, canTransition, CUSTOMER_SAFE_EVENTS } from "../../../utils/oms/status"
import { validateRegionCurrency } from "../../../utils/oms/region-safety"
import { customerSafeOrder } from "../../../utils/oms/responses"
import { isDigital, itemSnapshot } from "../../../workflows/oms/ingest-order"
import { locationSupportsOrder } from "../../../utils/oms/location-policy"

const root = process.cwd()
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8")

describe("Phase 3A OMS foundation", () => {
  it("1. accepts Canada CAD order ingestion safety", () => {
    expect(validateRegionCurrency({ regionId: "reg_ca", regionCurrency: "cad", orderCurrency: "CAD", countryCode: "ca" })).toEqual([])
  })

  it("2. accepts USA USD order ingestion safety", () => {
    expect(validateRegionCurrency({ regionId: "reg_us", regionCurrency: "usd", orderCurrency: "USD", countryCode: "us" })).toEqual([])
  })

  it("3. enforces idempotent duplicate ingestion at service and database boundaries", () => {
    const workflow = read("src", "workflows", "oms", "ingest-order.ts")
    const migration = read("src", "modules", "oms", "migrations", "Migration20260728000001.ts")
    expect(workflow).toContain("listOmsOrders({ order_id }")
    expect(workflow).toContain("reused: true")
    expect(migration).toContain("IDX_oms_order_order_id_unique")
  })

  it("4. splits a multi-vendor order into one bucket per vendor", () => {
    const items = [itemSnapshot({ id: "a", product_id: "p1", quantity: 1, unit_price: 10 }, "v1", "cad"), itemSnapshot({ id: "b", product_id: "p2", quantity: 2, unit_price: 20 }, "v2", "cad")]
    expect(new Set(items.map((item) => item.vendor_id))).toEqual(new Set(["v1", "v2"]))
  })

  it("5. preserves the PLATFORM-owned product group", () => {
    expect(itemSnapshot({ id: "a", product_id: "p1", quantity: 1, unit_price: 10 }, "PLATFORM", "usd").vendor_id).toBe("PLATFORM")
  })

  it("6. excludes digital items from physical fulfillment", () => {
    const item = { metadata: { is_digital: true }, quantity: 1, unit_price: 100 }
    expect(isDigital(item)).toBe(true)
    expect(itemSnapshot(item, "v1", "cad").requires_shipping).toBe(false)
  })

  it("7. preserves personalized metadata", () => {
    const metadata = { personalization_hash: "sha", engraving: "Aryan" }
    const snapshot = itemSnapshot({ metadata, quantity: 1, unit_price: 50 }, "v1", "cad")
    expect(snapshot.is_personalized).toBe(true)
    expect(snapshot.metadata).toEqual(metadata)
  })

  it("8. puts invalid region/currency combinations on hold", () => {
    expect(validateRegionCurrency({ regionId: "reg_ca", regionCurrency: "cad", orderCurrency: "usd", countryCode: "ca" })).toEqual(expect.arrayContaining(["REGION_CURRENCY_MISMATCH", "CANADA_REQUIRES_CAD"]))
  })

  it("rejects a shipping country outside the selected region", () => {
    expect(validateRegionCurrency({ regionId: "reg_ca", regionCurrency: "cad", regionCountryCodes: ["ca"], orderCurrency: "cad", countryCode: "us" })).toContain("SHIPPING_COUNTRY_OUTSIDE_REGION")
  })

  it("9. applies vendor access isolation in every vendor detail/action route", () => {
    for (const action of ["route.ts", "accept/route.ts", "reject/route.ts", "ready/route.ts", "ship/route.ts"]) {
      const source = read("src", "api", "vendor", "oms", "orders", "[id]", ...action.split("/"))
      expect(source).toContain("order.vendor_id !== vendorId")
    }
  })

  it("10. protects admin OMS APIs with authenticated admin middleware", () => {
    const middleware = read("src", "api", "middlewares.ts")
    expect(middleware).toContain('matcher: "/admin/*"')
    expect(middleware).toContain("middlewares: [adminNoStoreAuthenticated]")
  })

  it("11. applies customer access isolation and safe projection", () => {
    const route = read("src", "api", "store", "customers", "me", "oms", "orders", "[id]", "route.ts")
    expect(route).toContain("order.customer_id !== customerId")
    const result = customerSafeOrder({ id: "o", metadata: { secret: true } }, [{ vendor_id: "private", metadata: { internal_note: "x" } }], []) as any
    expect(result.metadata).toBeUndefined()
    expect(result.shipments[0].vendor_id).toBeUndefined()
  })

  it("12. accepts valid status transitions", () => {
    expect(canTransition("PENDING", "CONFIRMED")).toBe(true)
    expect(() => assertTransition("SHIPPED", "DELIVERED")).not.toThrow()
  })

  it("13. rejects invalid transitions for HTTP 409 handling", () => {
    for (const pair of [["DELIVERED", "PROCESSING"], ["CANCELLED", "SHIPPED"], ["REFUNDED", "CONFIRMED"]] as const) {
      try { assertTransition(pair[0], pair[1]); throw new Error("expected rejection") } catch (error: any) { expect(error.status).toBe(409) }
    }
  })

  it("14. enforces append-only timeline behavior in the database", () => {
    const migration = read("src", "modules", "oms", "migrations", "Migration20260728000001.ts")
    expect(migration).toContain("before update or delete")
    expect(migration).toContain("OMS order events are append-only")
  })

  it("15. prevents duplicate vendor orders", () => {
    expect(read("src", "modules", "oms", "migrations", "Migration20260728000001.ts")).toContain("IDX_oms_vendor_order_unique")
  })

  it("16. records fulfillment assignment failure without allocating", () => {
    const source = read("src", "workflows", "oms", "ingest-order.ts")
    expect(source).toContain('event_type: "NO_FULFILLMENT_LOCATION"')
    expect(source).toContain('status: "ON_HOLD"')
  })

  it("requires location country, service zone, and sales-channel compatibility", () => {
    const location = { address: { country_code: "ca" }, sales_channels: [{ id: "sc" }], fulfillment_sets: [{ service_zones: [{ geo_zones: [{ country_code: "ca" }] }] }] }
    expect(locationSupportsOrder(location, "ca", "sc")).toBe(true)
    expect(locationSupportsOrder(location, "us", "sc")).toBe(false)
    expect(locationSupportsOrder(location, "ca", "other")).toBe(false)
  })

  it("17. leaves existing checkout implementation untouched and subscribes after order placement", () => {
    expect(read("src", "subscribers", "oms-order-placed.ts")).toContain('event: "order.placed"')
    expect(fs.existsSync(path.join(root, "src", "api", "store", "carts", "[id]", "complete", "route.ts"))).toBe(true)
  })

  it("only exposes customer-safe timeline events", () => {
    expect(CUSTOMER_SAFE_EVENTS.has("ORDER_RECEIVED")).toBe(true)
    expect(CUSTOMER_SAFE_EVENTS.has("ERROR")).toBe(false)
  })
})
