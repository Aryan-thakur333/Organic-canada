import { setHstsHeader } from "../utils/security"
import type { MedusaResponse } from "@medusajs/framework/http"

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockRes(): MedusaResponse & { headers: Record<string, string> } {
  const headers: Record<string, string> = {}
  return {
    setHeader: jest.fn((key: string, value: string) => {
      headers[key] = value
    }),
    get headers() {
      return headers
    },
  } as unknown as MedusaResponse & { headers: Record<string, string> }
}

// ── HSTS Tests ───────────────────────────────────────────────────────────────

describe("setHstsHeader", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("sets HSTS header in production", () => {
    const res = mockRes()
    setHstsHeader(res, "production")
    expect(res.headers["Strict-Transport-Security"]).toBe(
      "max-age=31536000; includeSubDomains; preload"
    )
  })

  it("does not set HSTS header in development", () => {
    const res = mockRes()
    setHstsHeader(res, "development")
    expect(res.headers["Strict-Transport-Security"]).toBeUndefined()
  })

  it("does not set HSTS header when NODE_ENV is undefined", () => {
    const res = mockRes()
    setHstsHeader(res, undefined)
    expect(res.headers["Strict-Transport-Security"]).toBeUndefined()
  })

  it("does not set HSTS header in test environment", () => {
    const res = mockRes()
    setHstsHeader(res, "test")
    expect(res.headers["Strict-Transport-Security"]).toBeUndefined()
  })
})
