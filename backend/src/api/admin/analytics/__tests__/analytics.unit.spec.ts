/**
 * Unit tests for backend/src/api/admin/analytics/route.ts
 *
 * Tests the GET handler with mocked MedusaRequest, MedusaResponse,
 * query.graph (Remote Query API), and VENDOR_MODULE service.
 */

import { GET } from "../route"
import { VENDOR_MODULE } from "../../../../modules/vendor"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockReq(overrides: Partial<MedusaRequest> = {}): MedusaRequest {
  return {
    headers: {},
    ip: "127.0.0.1",
    ...overrides,
  } as unknown as MedusaRequest
}

function mockRes(): MedusaResponse {
  let statusCode = 200
  let jsonBody: any = null
  return {
    status: jest.fn((code: number) => {
      statusCode = code
      return { json: jest.fn((data: any) => { jsonBody = data }) } as any
    }),
    json: jest.fn((data: any) => { jsonBody = data }),
    setHeader: jest.fn(),
    get statusCode() { return statusCode },
    get body() { return jsonBody },
  } as unknown as MedusaResponse
}

// ── Mock data builders ───────────────────────────────────────────────────────

function makeOrderItem(overrides: Partial<any> = {}) {
  return {
    id: "item-1",
    product_id: "prod-a",
    title: "Test Product",
    unit_price: 1999,
    quantity: 2,
    thumbnail: null,
    ...overrides,
  }
}

function makeOrder(overrides: Partial<any> = {}) {
  return {
    id: "order-1",
    display_id: 1001,
    email: "customer@test.com",
    currency_code: "usd",
    total: 3998,
    subtotal: 3998,
    status: "completed",
    payment_status: "captured",
    fulfillment_status: "fulfilled",
    created_at: "2025-03-15T00:00:00Z",
    items: [makeOrderItem()],
    ...overrides,
  }
}

function makeVendor(overrides: Partial<any> = {}) {
  return {
    id: "vend-1",
    name: "Test Vendor",
    store_name: "Test Store",
    email: "vendor@test.com",
    status: "approved",
    ...overrides,
  }
}

// ── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GET /admin/analytics", () => {
  it("returns zero values when there are no orders", async () => {
    const mockQuery = {
      graph: jest.fn().mockResolvedValue({ data: [] }),
    }

    const mockVendorService = {
      listVendors: jest.fn().mockResolvedValue([]),
    }

    const req = mockReq({
      scope: {
        resolve: jest.fn((name: string) => {
          if (name === "query") return mockQuery
          if (name === VENDOR_MODULE) return mockVendorService
          return null
        }),
      } as any,
    })
    const res = mockRes()

    await GET(req, res)

    const a = res.body.analytics
    expect(a.totalRevenue).toBe(0)
    expect(a.totalOrders).toBe(0)
    expect(a.activeOrders).toBe(0)
    expect(a.aov).toBe(0)
    expect(a.revenueByMonth).toHaveLength(12)
    expect(a.vendor_performance_splits).toEqual([])
  })

  it("computes total revenue, AOV, and order counts correctly", async () => {
    // 3 orders: $100, $50, $0 (canceled)
    const orders = [
      makeOrder({ id: "o1", total: 10000, status: "completed", items: [] }),
      makeOrder({ id: "o2", total: 5000, status: "completed", items: [] }),
      makeOrder({ id: "o3", total: 2000, status: "canceled", items: [] }),
    ]

    const mockQuery = {
      graph: jest.fn().mockResolvedValue({ data: orders }),
    }

    const mockVendorService = {
      listVendors: jest.fn().mockResolvedValue([]),
    }

    const req = mockReq({
      scope: {
        resolve: jest.fn((name: string) => {
          if (name === "query") return mockQuery
          if (name === VENDOR_MODULE) return mockVendorService
          return null
        }),
      } as any,
    })
    const res = mockRes()

    await GET(req, res)

    const a = res.body.analytics
    // totalRevenue = 10000 + 5000 = 15000 (canceled excluded)
    expect(a.totalRevenue).toBe(15000)
    // totalOrders includes all orders (even canceled)
    expect(a.totalOrders).toBe(3)
    // activeOrders = orders not canceled and not completed
    expect(a.activeOrders).toBe(0)
    // AOV = 15000 / 3 = 5000
    expect(a.aov).toBe(5000)
  })

  it("generates 12-month revenue timeline with YYYY-MM keys", async () => {
    const now = new Date()
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 15)
    const mockQuery = {
      graph: jest.fn().mockResolvedValue({
        data: [
          makeOrder({ id: "o1", total: 10000, status: "completed", created_at: threeMonthsAgo.toISOString(), items: [] }),
        ],
      }),
    }

    const mockVendorService = {
      listVendors: jest.fn().mockResolvedValue([]),
    }

    const req = mockReq({
      scope: {
        resolve: jest.fn((name: string) => {
          if (name === "query") return mockQuery
          if (name === VENDOR_MODULE) return mockVendorService
          return null
        }),
      } as any,
    })
    const res = mockRes()

    await GET(req, res)

    const months = res.body.analytics.revenueByMonth
    expect(months).toHaveLength(12)

    // All months should have YYYY-MM format
    for (const m of months) {
      expect(m.month).toMatch(/^\d{4}-\d{2}$/)
    }

    // The first month should be 11 months ago
    const firstMonth = new Date(now.getFullYear(), now.getMonth() - 11, 1)
    const firstExpectedKey = `${firstMonth.getFullYear()}-${String(firstMonth.getMonth() + 1).padStart(2, "0")}`
    expect(months[0].month).toBe(firstExpectedKey)

    // The last month should be the current month
    const lastExpectedKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    expect(months[11].month).toBe(lastExpectedKey)

    // The month with the order should have revenue > 0, others should have 0
    const orderedMonthKey = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, "0")}`
    const orderedMonth = months.find((m: any) => m.month === orderedMonthKey)
    expect(orderedMonth).toBeDefined()
    expect(orderedMonth.revenue).toBeGreaterThan(0)
    expect(orderedMonth.orders).toBe(1)
  })

  it("computes order status breakdown", async () => {
    const orders = [
      makeOrder({ id: "o1", status: "completed" }),
      makeOrder({ id: "o2", status: "completed" }),
      makeOrder({ id: "o3", status: "pending" }),
      makeOrder({ id: "o4", status: "canceled" }),
      makeOrder({ id: "o5", status: "processing" }),
    ]

    const mockQuery = {
      graph: jest.fn().mockResolvedValue({ data: orders }),
    }

    const mockVendorService = {
      listVendors: jest.fn().mockResolvedValue([]),
    }

    const req = mockReq({
      scope: {
        resolve: jest.fn((name: string) => {
          if (name === "query") return mockQuery
          if (name === VENDOR_MODULE) return mockVendorService
          return null
        }),
      } as any,
    })
    const res = mockRes()

    await GET(req, res)

    const breakdown = res.body.analytics.statusBreakdown
    expect(breakdown.completed).toBe(2)
    expect(breakdown.pending).toBe(1)
    expect(breakdown.canceled).toBe(1)
    expect(breakdown.processing).toBe(1)
  })

  it("returns top products sorted by revenue", async () => {
    const orders = [
      makeOrder({
        id: "o1",
        items: [
          makeOrderItem({ product_id: "p1", title: "Product A", unit_price: 1000, quantity: 5 }),
          makeOrderItem({ id: "i2", product_id: "p2", title: "Product B", unit_price: 5000, quantity: 1 }),
        ],
      }),
      makeOrder({
        id: "o2",
        items: [
          makeOrderItem({ id: "i3", product_id: "p1", title: "Product A", unit_price: 1000, quantity: 3 }),
        ],
      }),
    ]

    const mockQuery = {
      graph: jest.fn().mockResolvedValue({ data: orders }),
    }

    const mockVendorService = {
      listVendors: jest.fn().mockResolvedValue([]),
    }

    const req = mockReq({
      scope: {
        resolve: jest.fn((name: string) => {
          if (name === "query") return mockQuery
          if (name === VENDOR_MODULE) return mockVendorService
          return null
        }),
      } as any,
    })
    const res = mockRes()

    await GET(req, res)

    const topProducts = res.body.analytics.topProducts
    expect(topProducts).toHaveLength(2)
    // Product A: 8000 revenue (rank 1), Product B: 5000 revenue (rank 2)
    expect(topProducts[0].title).toBe("Product A")
      expect(topProducts[0].quantity).toBe(8)
      expect(topProducts[0].revenue).toBe(8000)

      expect(topProducts[1].title).toBe("Product B")
      expect(topProducts[1].quantity).toBe(1)
      expect(topProducts[1].revenue).toBe(5000)
  })

  it("returns recent orders sorted by created_at descending", async () => {
    const orders = [
      makeOrder({ id: "o1", created_at: "2025-01-01T00:00:00Z" }),
      makeOrder({ id: "o2", created_at: "2025-06-01T00:00:00Z" }),
      makeOrder({ id: "o3", created_at: "2025-03-01T00:00:00Z" }),
    ]

    const mockQuery = {
      graph: jest.fn().mockResolvedValue({ data: orders }),
    }

    const mockVendorService = {
      listVendors: jest.fn().mockResolvedValue([]),
    }

    const req = mockReq({
      scope: {
        resolve: jest.fn((name: string) => {
          if (name === "query") return mockQuery
          if (name === VENDOR_MODULE) return mockVendorService
          return null
        }),
      } as any,
    })
    const res = mockRes()

    await GET(req, res)

    const recent = res.body.analytics.recentOrders
    expect(recent).toHaveLength(3)
    expect(recent[0].id).toBe("o2") // newest first
    expect(recent[1].id).toBe("o3")
    expect(recent[2].id).toBe("o1") // oldest last
  })

  it("computes vendor summary when vendor module is available", async () => {
    const orders = [
      makeOrder({ id: "o1", items: [makeOrderItem({ product_id: "prod-a" })] }),
    ]

    const vendors = [
      makeVendor({ id: "v1", status: "approved" }),
      makeVendor({ id: "v2", status: "approved" }),
      makeVendor({ id: "v3", status: "pending" }),
      makeVendor({ id: "v4", status: "rejected" }),
    ]

    const mockQuery = {
      graph: jest.fn((query: any) => {
        if (query.entity === "order") return { data: orders }
        if (query.entity === "vendor") return { data: [] }
        return { data: [] }
      }),
    }

    const mockVendorService = {
      listVendors: jest.fn().mockResolvedValue(vendors),
    }

    const req = mockReq({
      scope: {
        resolve: jest.fn((name: string) => {
          if (name === "query") return mockQuery
          if (name === VENDOR_MODULE) return mockVendorService
          return null
        }),
      } as any,
    })
    const res = mockRes()

    await GET(req, res)

    const vs = res.body.analytics.vendorSummary
    expect(vs.total).toBe(4)
    expect(vs.approved).toBe(2)
    expect(vs.pending).toBe(1)
    expect(vs.rejected).toBe(1)
    expect(vs.suspended).toBe(0)
  })

  it("computes vendor performance splits from cross-vendor orders", async () => {
    const vendors = [
      makeVendor({ id: "v1", store_name: "Farm A", status: "approved" }),
      makeVendor({ id: "v2", store_name: "Farm B", status: "approved" }),
    ]

    // An order with items from two different vendors
    const orders = [
      makeOrder({
        id: "o1",
        items: [
          makeOrderItem({ product_id: "prod-a", unit_price: 1000, quantity: 3 }), // Farm A: $30.00
          makeOrderItem({ id: "i2", product_id: "prod-b", unit_price: 2000, quantity: 2 }), // Farm B: $40.00
        ],
      }),
      makeOrder({
        id: "o2",
        items: [
          makeOrderItem({ id: "i3", product_id: "prod-a", unit_price: 500, quantity: 1 }), // Farm A: $5.00
        ],
      }),
    ]

    const vendorProductLinks = [
      { id: "v1", product: [{ id: "prod-a" }] },
      { id: "v2", product: [{ id: "prod-b" }] },
    ]

    let queryCallCount = 0
    const mockQuery = {
      graph: jest.fn((query: any) => {
        queryCallCount++
        if (query.entity === "order") return { data: orders }
        if (query.entity === "vendor") return { data: vendorProductLinks }
        return { data: [] }
      }),
    }

    const mockVendorService = {
      listVendors: jest.fn().mockResolvedValue(vendors),
    }

    const req = mockReq({
      scope: {
        resolve: jest.fn((name: string) => {
          if (name === "query") return mockQuery
          if (name === VENDOR_MODULE) return mockVendorService
          return null
        }),
      } as any,
    })
    const res = mockRes()

    await GET(req, res)

    const splits = res.body.analytics.vendor_performance_splits
    expect(splits).toHaveLength(2)

    // Farm A: $30.00 + $5.00 = $35.00 across 2 orders
    const farmA = splits.find((s: any) => s.vendor_id === "v1")
    expect(farmA).toBeDefined()
    expect(farmA.vendor_name).toBe("Farm A")
    expect(farmA.total_revenue_cents).toBe(3500)
    expect(farmA.total_orders).toBe(2)
    expect(farmA.total_items).toBe(4)

    // Farm B: $40.00 across 1 order
    const farmB = splits.find((s: any) => s.vendor_id === "v2")
    expect(farmB).toBeDefined()
    expect(farmB.vendor_name).toBe("Farm B")
    expect(farmB.total_revenue_cents).toBe(4000)
    expect(farmB.total_orders).toBe(1)
    expect(farmB.total_items).toBe(2)

    // Verify splits sorted by revenue descending (Farm B first at $40)
    expect(splits[0].vendor_id).toBe("v2")
    expect(splits[1].vendor_id).toBe("v1")
  })

  it("returns empty vendor_performance_splits when vendor module throws", async () => {
    const orders = [
      makeOrder({ id: "o1", items: [makeOrderItem({ product_id: "prod-a" })] }),
    ]

    const mockQuery = {
      graph: jest.fn((query: any) => {
        if (query.entity === "order") return { data: orders }
        return { data: [] }
      }),
    }

    // When vendorService.listVendors throws, the vendor block is silently caught
    const mockVendorService = {
      listVendors: jest.fn().mockRejectedValue(new Error("Module not registered")),
    }

    const req = mockReq({
      scope: {
        resolve: jest.fn((name: string) => {
          if (name === "query") return mockQuery
          if (name === VENDOR_MODULE) return mockVendorService
          return null
        }),
      } as any,
    })
    const res = mockRes()

    await GET(req, res)

    const a = res.body.analytics
    expect(a.vendorSummary).toEqual({ total: 0, pending: 0, approved: 0, rejected: 0, suspended: 0 })
    expect(a.vendor_performance_splits).toEqual([])
  })

  it("handles cancel exclusion correctly for revenue calculation", async () => {
    const orders = [
      makeOrder({ id: "o1", total: 10000, status: "canceled", items: [] }),
      makeOrder({ id: "o2", total: 5000, status: "canceled", items: [] }),
    ]

    const mockQuery = {
      graph: jest.fn().mockResolvedValue({ data: orders }),
    }

    const mockVendorService = {
      listVendors: jest.fn().mockResolvedValue([]),
    }

    const req = mockReq({
      scope: {
        resolve: jest.fn((name: string) => {
          if (name === "query") return mockQuery
          if (name === VENDOR_MODULE) return mockVendorService
          return null
        }),
      } as any,
    })
    const res = mockRes()

    await GET(req, res)

    const a = res.body.analytics
    expect(a.totalRevenue).toBe(0) // canceled excluded
    expect(a.totalOrders).toBe(2)    // still counted in total
    expect(a.activeOrders).toBe(0)   // canceled excluded
  })

  it("returns 500 and error message when query.graph throws", async () => {
    const mockQuery = {
      graph: jest.fn().mockRejectedValue(new Error("Database connection failed")),
    }

    const req = mockReq({
      scope: {
        resolve: jest.fn((name: string) => {
          if (name === "query") return mockQuery
          return null
        }),
      } as any,
    })
    const res = mockRes()

    await GET(req, res)

    expect(res.statusCode).toBe(500)
    expect(res.body.message).toContain("Database connection failed")
  })
})
