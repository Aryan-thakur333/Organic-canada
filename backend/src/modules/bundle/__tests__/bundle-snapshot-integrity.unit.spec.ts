import fs from "fs"
import path from "path"
import { getBundleGroupId } from "../utils/group-id"
import { BundleSnapshotIntegrityError, getActiveCartBundleSnapshot } from "../utils/snapshot-integrity"
import { majorToMinor, minorToMajor } from "../utils/money"

describe("bundle snapshot integrity", () => {
  it("uses exactly the canonical non-empty bundle group ID", () => {
    expect(getBundleGroupId({ metadata: { bundle_group_id: " bg_1 " } })).toBe("bg_1")
    expect(getBundleGroupId({ metadata: { bundle_group_id: "  " } })).toBeNull()
    expect(getBundleGroupId({ metadata: {} })).toBeNull()
  })

  it("uses indexed active snapshot fields and rejects missing or duplicate records", async () => {
    const listBundleLineSnapshots = jest.fn().mockResolvedValue([])
    const scope = { resolve: jest.fn(() => ({ listBundleLineSnapshots })) }
    await expect(getActiveCartBundleSnapshot({ scope, cartId: "cart_1", bundleGroupId: "bg_1" }))
      .rejects.toMatchObject({ code: "BUNDLE_SNAPSHOT_NOT_FOUND", status: 404 } satisfies Partial<BundleSnapshotIntegrityError>)
    expect(listBundleLineSnapshots).toHaveBeenCalledWith({ cart_id: "cart_1", bundle_group_id: "bg_1", status: "active" })

    listBundleLineSnapshots.mockResolvedValue([{ id: "one" }, { id: "two" }])
    await expect(getActiveCartBundleSnapshot({ scope, cartId: "cart_1", bundleGroupId: "bg_1" }))
      .rejects.toMatchObject({ code: "BUNDLE_SNAPSHOT_DUPLICATE", status: 409 })

    listBundleLineSnapshots.mockRejectedValue(new Error("database offline"))
    await expect(getActiveCartBundleSnapshot({ scope, cartId: "cart_1", bundleGroupId: "bg_1" }))
      .rejects.toMatchObject({ code: "BUNDLE_SNAPSHOT_QUERY_FAILED", status: 500 })
  })

  it("creates a pending snapshot before lines and activates only after price verification", () => {
    const workflow = fs.readFileSync(path.join(process.cwd(), "src/workflows/add-bundle-to-cart.ts"), "utf8")
    expect(workflow.indexOf("const pendingSnapshot = createBundleSnapshot")).toBeLessThan(workflow.indexOf("const { addedLineIds, lineItems } = addBundleComponentLinesToCart"))
    expect(workflow).toContain('status: "pending"')
    expect(workflow).toContain('status: "active"')
    expect(workflow).toContain("lineTotal !== input.expectedTotal")
    expect(workflow).toContain("const pricingInput = transform")
    expect(workflow).toContain("expectedTotalMinor")
    expect(workflow).not.toContain("expectedTotal: (bundlePrice as any) * input.quantity")
  })

  it("keeps legacy recovery explicitly opt-in and price-safe", () => {
    const repair = fs.readFileSync(path.join(process.cwd(), "src/scripts/repair-legacy-bundle-cart-snapshot.ts"), "utf8")
    expect(repair).toContain('process.argv.includes("--apply")')
    expect(repair).toContain("Component identities, quantities, or quoted price do not match")
    expect(repair).toContain("repaired_from_legacy_lines: true")
  })

  it("converts configured major prices exactly once before minor allocation", () => {
    expect(majorToMinor(21.99, "usd")).toBe(2199)
    expect(majorToMinor(29.99, "cad")).toBe(2999)
    expect(minorToMajor(2199, "usd")).toBe(21.99)
    expect(() => majorToMinor(0, "usd")).toThrow("BUNDLE_PRICE_INVALID")
  })
})
