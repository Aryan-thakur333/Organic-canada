import fs from "fs"
import path from "path"
import {
  convertCartBundleSnapshotsToOrder,
  findOrderForCart,
  OrderCartLookupError,
} from "../order-cart"

describe("cart order link completion idempotency", () => {
  it("uses the supported order_cart link and returns null when no order exists", async () => {
    const graph = jest.fn().mockResolvedValue({ data: [] })
    await expect(findOrderForCart({ query: { graph }, cartId: "cart_1" })).resolves.toEqual({
      order: null,
      lookupSource: "order_cart_link",
    })
    expect(graph).toHaveBeenCalledWith(expect.objectContaining({
      entity: "order_cart",
      filters: { cart_id: "cart_1" },
    }))
  })

  it("retrieves the linked order by its supported id field", async () => {
    const graph = jest.fn()
      .mockResolvedValueOnce({ data: [{ cart_id: "cart_1", order_id: "ord_1" }] })
      .mockResolvedValueOnce({ data: [{ id: "ord_1", display_id: 101, status: "pending" }] })

    await expect(findOrderForCart({ query: { graph }, cartId: "cart_1" })).resolves.toEqual({
      order: { id: "ord_1", display_id: 101, status: "pending" },
      lookupSource: "order_cart_link",
    })
    expect(graph).toHaveBeenLastCalledWith(expect.objectContaining({ entity: "order", filters: { id: "ord_1" } }))
  })

  it("treats a relationship query failure as a server failure, never as no order", async () => {
    await expect(findOrderForCart({ query: { graph: jest.fn().mockRejectedValue(new Error("offline")) }, cartId: "cart_1" }))
      .rejects.toMatchObject({ code: "ORDER_CART_LOOKUP_FAILED", status: 500 } satisfies Partial<OrderCartLookupError>)
  })

  it("converts only outstanding cart bundle snapshots and resumes safely on retry", async () => {
    const updateBundleLineSnapshots = jest.fn().mockResolvedValue({})
    const scope = { resolve: jest.fn(() => ({
      listBundleLineSnapshots: jest.fn().mockResolvedValue([
        { id: "snap_active", bundle_group_id: "group_1", status: "active", reservation_status: "reserved" },
        { id: "snap_done", bundle_group_id: "group_1", status: "converted", order_id: "ord_1" },
      ]),
      updateBundleLineSnapshots,
    })) }
    const query = { graph: jest.fn().mockResolvedValue({ data: [{ id: "ord_1", items: [{ id: "item_1", metadata: { bundle_group_id: "group_1" } }] }] }) }

    await convertCartBundleSnapshotsToOrder({ scope, query, cartId: "cart_1", orderId: "ord_1" })
    expect(updateBundleLineSnapshots).toHaveBeenCalledTimes(1)
    expect(updateBundleLineSnapshots).toHaveBeenCalledWith(expect.objectContaining({
      id: "snap_active", status: "converted", order_id: "ord_1", order_line_item_id: "item_1", reservation_status: "committed",
    }))
  })

  it("removes the unsupported Order.cart_id filter from the completion route", () => {
    const route = fs.readFileSync(path.join(process.cwd(), "src/api/store/carts/[id]/complete/route.ts"), "utf8")
    const helper = fs.readFileSync(path.join(process.cwd(), "src/utils/order-cart.ts"), "utf8")
    expect(route).not.toContain('fields: ["id", "display_id", "status", "cart_id"]')
    expect(helper).toContain('entity: "order_cart"')
    expect(helper).toContain('filters: { cart_id: cartId }')
    expect(helper).toContain('filters: { id: link.order_id }')
  })
})
