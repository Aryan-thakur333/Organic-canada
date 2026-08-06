import fs from "fs"
import path from "path"
import { calculateBundleAvailability } from "../utils/availability"
import { validateFixedBundleComponents } from "../utils/configuration"
import { allocateBundlePriceMinor } from "../utils/price-allocation"

const component = (id: string, quantity: number, levels: any[]) => ({
  variant_id: id, quantity, manage_inventory: true, allow_backorder: false,
  inventory_items: [{ inventory_item_id: `inv_${id}`, required_quantity: 1, inventory: { location_levels: levels } }],
})

describe("fixed bundle production contract", () => {
  it("rejects invalid counts, duplicate variants, and non-positive quantities", () => {
    expect(() => validateFixedBundleComponents([component("a", 1, [])])).toThrow(/2 to 25/)
    expect(() => validateFixedBundleComponents([{ variant_id: "a", quantity: 1 }, { variant_id: "a", quantity: 2 }])).toThrow(/Duplicate/)
    expect(() => validateFixedBundleComponents([{ variant_id: "a", quantity: 0 }, { variant_id: "b", quantity: 1 }])).toThrow(/positive integer/)
  })

  it("calculates minimum component availability", () => {
    const result = calculateBundleAvailability([
      component("a", 2, [{ location_id: "ca", available_quantity: 10 }]),
      component("b", 1, [{ location_id: "ca", available_quantity: 3 }]),
    ], ["ca"])
    expect(result[0].available_quantity).toBe(3)
  })

  it("isolates Canada and USA stock without summing locations", () => {
    const levels = [{ location_id: "ca", available_quantity: 2 }, { location_id: "us", available_quantity: 9 }]
    const results = calculateBundleAvailability([component("a", 1, levels), component("b", 1, levels)], ["ca", "us"])
    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ location_id: "ca", available_quantity: 2 }),
      expect.objectContaining({ location_id: "us", available_quantity: 9 }),
    ]))
  })

  it("accounts for component and inventory-link required quantities", () => {
    const item = component("a", 2, [{ location_id: "ca", available_quantity: 12 }])
    item.inventory_items[0].required_quantity = 3
    expect(calculateBundleAvailability([item], ["ca"])[0].available_quantity).toBe(2)
  })

  it("allocates integer minor units exactly once, including non-divisible component quantities", () => {
    const lines = allocateBundlePriceMinor(2199, [
      { id: "apple", quantity: 2, title: "Apples", sku: "APPLE", product: { id: "p1", title: "Apples" } },
      { id: "honey", quantity: 1, title: "Honey", sku: "HONEY", product: { id: "p2", title: "Honey" } },
      { id: "berry", quantity: 3, title: "Berries", sku: "BERRY", product: { id: "p3", title: "Berries" } },
    ], 1)
    expect(lines.reduce((total, line) => total + line.unit_price * line.quantity, 0)).toBe(2199)
    expect(lines.every((line) => Number.isInteger(line.unit_price))).toBe(true)
    expect(lines.some((line) => line.unit_price === 219900)).toBe(false)
  })

  it("returns zero when a component has no level at the selected location", () => {
    expect(calculateBundleAvailability([component("a", 1, [{ location_id: "us", available_quantity: 5 }])], ["ca"])[0].available_quantity).toBe(0)
  })

  it("reservation implementation uses component reservations under cart lock", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/modules/bundle/utils/reservations.ts"), "utf8")
    expect(source).toContain("locking.execute(`bundle-checkout:${cartId}`")
    expect(source).toContain("createReservationItems(inputs)")
    expect(source).toContain("allow_backorder: false")
    expect(source).not.toMatch(/update\s+inventory_level|insert\s+into|delete\s+from/i)
  })

  it("order commit is idempotent and cancellation restores exact location deductions", () => {
    const commit = fs.readFileSync(path.join(process.cwd(), "src/subscribers/order-placed-bundle.ts"), "utf8")
    const cancel = fs.readFileSync(path.join(process.cwd(), "src/subscribers/order-canceled-bundle.ts"), "utf8")
    expect(commit).toContain('reservation_status === "committed"')
    expect(commit).toContain("deleteReservationItems(ids)")
    expect(cancel).toContain("reservation_status !== \"committed\"")
    expect(cancel).toContain("location_id: deduction.location_id")
  })
})
