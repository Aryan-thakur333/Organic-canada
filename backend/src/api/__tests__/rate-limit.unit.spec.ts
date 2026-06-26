import { getClientIp, checkRateLimit, setRateLimitHeaders, rateLimitBuckets } from "../utils/rate-limit"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockReq(overrides: Partial<MedusaRequest> = {}): MedusaRequest {
  return {
    headers: {},
    ip: "127.0.0.1",
    ...overrides,
  } as unknown as MedusaRequest
}

function mockRes(): { res: MedusaResponse; getHeader: (key: string) => string | undefined } {
  const headers: Record<string, string> = {}
  return {
    res: {
      setHeader: jest.fn((key: string, value: string) => {
        headers[key] = value
      }),
    } as unknown as MedusaResponse,
    getHeader: (key: string) => headers[key],
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("getClientIp", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("returns req.ip when no x-forwarded-for header", () => {
    const req = mockReq({ ip: "192.168.1.1" })
    expect(getClientIp(req)).toBe("192.168.1.1")
  })

  it("returns the first IP from x-forwarded-for", () => {
    const req = mockReq({
      headers: { "x-forwarded-for": "203.0.113.5, 198.51.100.2" } as any,
    })
    expect(getClientIp(req)).toBe("203.0.113.5")
  })

  it("handles x-forwarded-for as array", () => {
    const req = mockReq({
      headers: { "x-forwarded-for": ["10.0.0.1", "10.0.0.2"] } as any,
    })
    expect(getClientIp(req)).toBe("10.0.0.1")
  })

  it("falls back to 'unknown' when no IP is available", () => {
    const req = mockReq({ ip: undefined } as any)
    expect(getClientIp(req)).toBe("unknown")
  })

  it("trims whitespace from the IP", () => {
    const req = mockReq({
      headers: { "x-forwarded-for": "  10.0.0.1  " } as any,
    })
    expect(getClientIp(req)).toBe("10.0.0.1")
  })
})

describe("checkRateLimit", () => {
  const uniqueKey = () => `test:${Date.now()}:${Math.random()}`

  beforeEach(() => {
    rateLimitBuckets.clear()
  })

  it("allows the first request", () => {
    const result = checkRateLimit(uniqueKey(), 5, 60_000)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it("allows requests up to the limit", () => {
    const key = uniqueKey()
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit(key, 5, 60_000)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(4 - i)
    }
  })

  it("blocks requests that exceed the limit", () => {
    const key = uniqueKey()
    for (let i = 0; i < 5; i++) {
      checkRateLimit(key, 5, 60_000)
    }
    const result = checkRateLimit(key, 5, 60_000)
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it("resets after the window expires", async () => {
    const key = uniqueKey()
    // Exhaust the limit
    for (let i = 0; i < 3; i++) {
      checkRateLimit(key, 3, 50) // 50ms window
    }
    expect(checkRateLimit(key, 3, 50).allowed).toBe(false)

    // Wait for the window to expire
    await new Promise((resolve) => setTimeout(resolve, 60))

    const result = checkRateLimit(key, 3, 50)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(2)
  })

  it("uses separate buckets for different keys", () => {
    const keyA = uniqueKey()
    const keyB = uniqueKey()

    // Exhaust keyA
    for (let i = 0; i < 2; i++) {
      checkRateLimit(keyA, 2, 60_000)
    }
    expect(checkRateLimit(keyA, 2, 60_000).allowed).toBe(false)

    // keyB should still be allowed
    expect(checkRateLimit(keyB, 2, 60_000).allowed).toBe(true)
  })
})

describe("setRateLimitHeaders", () => {
  it("sets RateLimit-Limit header", () => {
    const { res, getHeader } = mockRes()
    setRateLimitHeaders(res, 10, 5, 1000000)
    expect(getHeader("RateLimit-Limit")).toBe("10")
  })

  it("sets RateLimit-Remaining header", () => {
    const { res, getHeader } = mockRes()
    setRateLimitHeaders(res, 10, 5, 1000000)
    expect(getHeader("RateLimit-Remaining")).toBe("5")
  })

  it("sets RateLimit-Reset header as seconds", () => {
    const { res, getHeader } = mockRes()
    setRateLimitHeaders(res, 10, 5, 1000000) // resetAt in ms → 1000 seconds
    expect(getHeader("RateLimit-Reset")).toBe("1000")
  })
})
