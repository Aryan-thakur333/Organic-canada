/**
 * Unit tests for backend/src/api/admin/marketplace-overview/route.ts
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

function makeVendor(overrides: Partial<any> = {}) {
  return {
    id: "vendor-1",
    name: "Test Vendor",
    store_name: "Test Store",
    email: "vendor@test.com",
    phone: "+1234567890",
    description: "A test vendor",
    company_details: null,
    status: "approved",
    created_at: "2025-01-15T00:00:00Z",
    ...overrides,
  }
}

function makeProduct(overrides: Partial<any> = {}) {
  return {
    id: "prod-1",
    title: "Test Product",
    handle: "test-product",
    status: "published",
    thumbnail: null,
    created_at: "2025-02-01T00:00:00Z",
    ...overrides,
  }
}

function makeOrderItem(overrides: Partial<any> = {}) {
  return {
    id: "item-1",
    product_id: "prod-1",
    title: "Test Product",
    unit_price: 1999, // $19.99 in cents
    quantity: 2,
    thumbnail: null,
    ...overrides,
  }
}

function makeOrder(overrides: Partial<any> = {}) {
  return {
    id: "order-1",
    display_id: 1001,
    status: "completed",
    total: 3998,
    created_at: "2025-03-01T00:00:00Z",
    items: [makeOrderItem()],
    ...overrides,
  }
}

// ── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GET /admin/marketplace-overview", () => {
  it("returns vendor health breakdown with correct counts", async () => {
    const vendors = [
      makeVendor({ id: "v1", status: "approved" }),
      makeVendor({ id: "v2", status: "approved" }),
      makeVendor({ id: "v3", status: "pending" }),
      makeVendor({ id: "v4", status: "rejected" }),
      makeVendor({ id: "v5", status: "suspended" }),
    ]

    const vendorProductLinks = vendors.map((v) => ({
      id: v.id,
      product: [],
    }))

    const mockQuery = {
      graph: jest.fn((query: any) => {
        if (query.entity === "vendor") {
          return { data: vendorProductLinks }
        }
        if (query.entity === "order") {
          return { data: [] }
        }
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

    const body = res.body
    expect(body).not.toBeNull()
    expect(body.marketplace).toBeDefined()
    expect(body.marketplace.vendor_health).toEqual({
      total: 5,
      pending: 1,
      approved: 2,
      rejected: 1,
      suspended: 1,
    })
  })

  it("returns total product count across all vendors", async () => {
    const vendors = [
      makeVendor({ id: "v1", status: "approved" }),
      makeVendor({ id: "v2", status: "pending" }),
    ]

    const vendorProductLinks = [
      { id: "v1", product: [makeProduct({ id: "p1" }), makeProduct({ id: "p2" })] },
      { id: "v2", product: [makeProduct({ id: "p3" })] },
    ]

    const mockQuery = {
      graph: jest.fn((query: any) => {
        if (query.entity === "vendor") {
          return { data: vendorProductLinks }
        }
        if (query.entity === "order") {
          return { data: [] }
        }
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

    expect(res.body.marketplace.total_products).toBe(3)
  })

  it("computes vendor rankings from completed orders", async () => {
    const vendors = [
      makeVendor({ id: "v1", store_name: "Store A", status: "approved" }),
      makeVendor({ id: "v2", store_name: "Store B", status: "approved" }),
    ]

    const vendorProductLinks = [
      {
        id: "v1",
        product: [
          makeProduct({ id: "prod-a" }),
          makeProduct({ id: "prod-b" }),
        ],
      },
      {
        id: "v2",
        product: [
          makeProduct({ id: "prod-c" }),
        ],
      },
    ]

    const orders = [
      makeOrder({
        id: "order-1",
        status: "completed",
        items: [
          makeOrderItem({ product_id: "prod-a", unit_price: 1000, quantity: 3 }), // $30.00
          makeOrderItem({ product_id: "prod-c", unit_price: 5000, quantity: 1 }), // $50.00
        ],
      }),
      makeOrder({
        id: "order-2",
        status: "completed",
        items: [
          makeOrderItem({ product_id: "prod-b", unit_price: 2000, quantity: 2 }), // $40.00
        ],
      }),
    ]

    const mockQuery = {
      graph: jest.fn((query: any) => {
        if (query.entity === "vendor") return { data: vendorProductLinks }
        if (query.entity === "order") return { data: orders }
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

    const rankings = res.body.marketplace.vendor_rankings
    expect(rankings).toHaveLength(2)      // Store A has $70.00 revenue (rank 1), Store B has $50.00 revenue (rank 2)
      expect(rankings[0].vendor_name).toBe("Store A")
      expect(rankings[0].revenue_cents).toBe(7000)
      expect(rankings[0].order_count).toBe(2)

      expect(rankings[1].vendor_name).toBe("Store B")
      expect(rankings[1].revenue_cents).toBe(5000)
      expect(rankings[1].order_count).toBe(1)
  })

  it("handles empty vendor list gracefully", async () => {
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

    const body = res.body.marketplace
    expect(body.vendor_health.total).toBe(0)
    expect(body.vendor_health.pending).toBe(0)
    expect(body.vendor_health.approved).toBe(0)
    expect(body.total_products).toBe(0)
    expect(body.total_revenue_cents).toBe(0)
    expect(body.vendor_rankings).toEqual([])
    expect(body.vendors).toEqual([])
  })

  it("handles no completed orders gracefully", async () => {
    const vendors = [
      makeVendor({ id: "v1", status: "approved" }),
      makeVendor({ id: "v2", status: "pending" }),
    ]

    const vendorProductLinks = [
      { id: "v1", product: [makeProduct({ id: "p1" })] },
      { id: "v2", product: [makeProduct({ id: "p2" })] },
    ]

    const mockQuery = {
      graph: jest.fn((query: any) => {
        if (query.entity === "vendor") return { data: vendorProductLinks }
        if (query.entity === "order") return { data: [] }
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

    const body = res.body.marketplace
    expect(body.total_completed_orders).toBe(0)
    expect(body.vendor_rankings).toHaveLength(2)
    expect(body.vendor_rankings[0].revenue_cents).toBe(0)
    expect(body.vendor_rankings[0].order_count).toBe(0)
  })

  it("deduplicates orders in vendor order counts", async () => {
    const vendors = [
      makeVendor({ id: "v1", store_name: "Store A", status: "approved" }),
    ]

    const vendorProductLinks = [
      {
        id: "v1",
        product: [makeProduct({ id: "prod-a" })],
      },
    ]

    // Two items from same vendor in the same order — should count as 1 order
    const orders = [
      makeOrder({
        id: "order-1",
        status: "completed",
        items: [
          makeOrderItem({ product_id: "prod-a", unit_price: 1000, quantity: 1 }),
          makeOrderItem({ id: "item-2", product_id: "prod-a", unit_price: 2000, quantity: 2 }),
        ],
      }),
    ]

    const mockQuery = {
      graph: jest.fn((query: any) => {
        if (query.entity === "vendor") return { data: vendorProductLinks }
        if (query.entity === "order") return { data: orders }
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

    const ranking = res.body.marketplace.vendor_rankings[0]
    // 1 order (deduplicated), 3 items, $50.00 revenue
    expect(ranking.order_count).toBe(1)
    expect(ranking.items_sold).toBe(3)
    expect(ranking.revenue_cents).toBe(5000)
  })

  it("returns vendor stats with product counts and revenue", async () => {
    const vendors = [
      makeVendor({ id: "v1", store_name: "Green Farm", email: "farm@test.com", status: "approved", created_at: "2025-01-01T00:00:00Z" }),
    ]

    const vendorProductLinks = [
      {
        id: "v1",
        product: [makeProduct({ id: "p1" }), makeProduct({ id: "p2" })],
      },
    ]

    const orders = [
      makeOrder({
        id: "order-1",
        status: "completed",
        items: [makeOrderItem({ product_id: "p1", unit_price: 1500, quantity: 2 })],
      }),
    ]

    const mockQuery = {
      graph: jest.fn((query: any) => {
        if (query.entity === "vendor") return { data: vendorProductLinks }
        if (query.entity === "order") return { data: orders }
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

    const vendorStat = res.body.marketplace.vendors[0]
    expect(vendorStat.name).toBe("Green Farm")
    expect(vendorStat.email).toBe("farm@test.com")
    expect(vendorStat.status).toBe("approved")
    expect(vendorStat.product_count).toBe(2)
    expect(vendorStat.total_revenue_cents).toBe(3000)
    expect(vendorStat.total_orders).toBe(1)
    expect(vendorStat.total_items_sold).toBe(2)
  })

  it("returns 500 and error message when vendor service throws", async () => {
    const mockVendorService = {
      listVendors: jest.fn().mockRejectedValue(new Error("DB connection failed")),
    }

    const mockQuery = {
      graph: jest.fn().mockRejectedValue(new Error("Query failed")),
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

    expect(res.statusCode).toBe(500)
    expect(res.body.message).toContain("DB connection failed")
  })
})
