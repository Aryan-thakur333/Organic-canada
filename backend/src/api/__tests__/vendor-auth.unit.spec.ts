/**
 * Unit tests for backend/src/api/vendor/auth.ts
 *
 * Tests are pure-function focused and do not require a Medusa container.
 * Internal functions (getJwtSecret, getCookieSecret) are tested through
 * the exported functions that call them (signToken, verifyToken,
 * authenticateVendor).
 */

import { hashPassword, comparePassword, signToken, verifyToken, authenticateVendor } from "../vendor/auth"
import type { MedusaRequest, MedusaResponse, MedusaNextFunction } from "@medusajs/framework/http"

// ── Persist the real env values so we can restore them after each test ───────

const ORIGINAL_JWT = process.env.JWT_SECRET
const ORIGINAL_COOKIE = process.env.COOKIE_SECRET
const VALID_SECRET = "abcdef1234567890abcdef1234567890abcdef12" // 38 chars — meets 32-char minimum
const SHORT_SECRET = "short"                                       // 5 chars  — fails

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
  let body: any = null
  return {
    status: jest.fn((code: number) => {
      statusCode = code
      return { json: jest.fn((data: any) => { body = data }) } as any
    }),
    json: jest.fn((data: any) => { body = data }),
    setHeader: jest.fn(),
    get statusCode() { return statusCode },
    get body() { return body },
  } as unknown as MedusaResponse
}

const mockNext: MedusaNextFunction = jest.fn()

// ── Setup / Teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
})

afterAll(() => {
  // Restore original env values (if any)
  if (ORIGINAL_JWT !== undefined) {
    process.env.JWT_SECRET = ORIGINAL_JWT
  } else {
    delete process.env.JWT_SECRET
  }
  if (ORIGINAL_COOKIE !== undefined) {
    process.env.COOKIE_SECRET = ORIGINAL_COOKIE
  } else {
    delete process.env.COOKIE_SECRET
  }
})

// ── hashPassword ─────────────────────────────────────────────────────────────

describe("hashPassword", () => {
  it("returns a bcrypt hash starting with $2", () => {
    const hash = hashPassword("MySecurePass123!")
    expect(hash).toMatch(/^\$2[abvy]\$\d+\$/)
  })

  it("produces different hashes for the same password (different salts)", () => {
    const hash1 = hashPassword("SamePass1!")
    const hash2 = hashPassword("SamePass1!")
    expect(hash1).not.toBe(hash2)
  })

  it("produces a hash of reasonable length (59-61 chars)", () => {
    const hash = hashPassword("AnotherPass1!")
    expect(hash.length).toBeGreaterThanOrEqual(59)
    expect(hash.length).toBeLessThanOrEqual(61)
  })
})

// ── comparePassword — bcrypt hashes ─────────────────────────────────────────

describe("comparePassword (bcrypt hashes)", () => {
  it("returns true for matching password and hash", () => {
    const password = "MySecurePass123!"
    const hash = hashPassword(password)
    expect(comparePassword(password, hash)).toBe(true)
  })

  it("returns false for wrong password", () => {
    const hash = hashPassword("RealPassword1!")
    expect(comparePassword("WrongPassword1!", hash)).toBe(false)
  })

  it("returns false for empty password", () => {
    const hash = hashPassword("RealPassword1!")
    expect(comparePassword("", hash)).toBe(false)
  })
})

// ── comparePassword — legacy pbkdf2 hashes (backward compat) ────────────────

describe("comparePassword (legacy pbkdf2 hashes)", () => {
  it("verifies a correctly formatted legacy hash", () => {
    // Generate a known salt and hash using the same pbkdf2 algorithm
    const crypto = require("crypto")
    const password = "legacyPass1!"
    const salt = crypto.randomBytes(16).toString("hex")
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex")
    const stored = `${salt}:${hash}`

    expect(comparePassword(password, stored)).toBe(true)
  })

  it("rejects wrong password for legacy hash", () => {
    const crypto = require("crypto")
    const salt = crypto.randomBytes(16).toString("hex")
    const hash = crypto.pbkdf2Sync("realPass1!", salt, 1000, 64, "sha512").toString("hex")
    const stored = `${salt}:${hash}`

    expect(comparePassword("wrongPass1!", stored)).toBe(false)
  })

  it("returns false for malformed legacy hash (no colon)", () => {
    expect(comparePassword("anyPass1!", "just-a-hash-without-colon")).toBe(false)
  })

  it("returns false for empty salt or hash parts", () => {
    expect(comparePassword("pass1!", ":hashvalue")).toBe(false)
    expect(comparePassword("pass1!", "saltvalue:")).toBe(false)
  })
})

// ── signToken ───────────────────────────────────────────────────────────────

describe("signToken", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = VALID_SECRET
  })

  it("returns a JWT string", () => {
    const token = signToken("vendor-123")
    expect(typeof token).toBe("string")
    // JWT has three dot-separated parts
    expect(token.split(".")).toHaveLength(3)
  })

  it("produces different tokens for different vendor IDs", () => {
    const token1 = signToken("vendor-111")
    const token2 = signToken("vendor-222")
    expect(token1).not.toBe(token2)
  })

  it("throws when JWT_SECRET is not set", () => {
    delete process.env.JWT_SECRET
    expect(() => signToken("vendor-123")).toThrow("JWT_SECRET")
  })

  it("throws when JWT_SECRET is too short", () => {
    process.env.JWT_SECRET = SHORT_SECRET
    expect(() => signToken("vendor-123")).toThrow("JWT_SECRET")
    expect(() => signToken("vendor-123")).toThrow(/32 characters/)
  })
})

// ── verifyToken ─────────────────────────────────────────────────────────────

describe("verifyToken", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = VALID_SECRET
  })

  it("decodes a token signed with the same secret", () => {
    const token = signToken("vendor-abc")
    const decoded = verifyToken(token)
    expect(decoded).not.toBeNull()
    expect(decoded!.vendorId).toBe("vendor-abc")
  })

  it("returns null for an invalid (tampered) token", () => {
    const token = signToken("vendor-abc")
    const parts = token.split(".")
    // Tamper the payload
    const tampered = [parts[0], "eyJfaW52YWxpZCI6dHJ1ZX0", parts[2]].join(".")
    expect(verifyToken(tampered)).toBeNull()
  })

  it("returns null for a completely bogus string", () => {
    expect(verifyToken("not-a-token")).toBeNull()
  })

  it("returns null for an empty string", () => {
    expect(verifyToken("")).toBeNull()
  })

  it("returns null when JWT_SECRET is not set (getJwtSecret throws, caught internally)", () => {
    delete process.env.JWT_SECRET
    // getJwtSecret() throws inside the try block → caught → returns null
    expect(verifyToken("some-token")).toBeNull()
  })
})

// ── Round-trip: signToken + verifyToken ────────────────────────────────────

describe("signToken + verifyToken round-trip", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = VALID_SECRET
  })

  it("round-trips successfully with a valid vendor ID", () => {
    const vendorId = "vendor-xyz-789"
    const token = signToken(vendorId)
    const decoded = verifyToken(token)
    expect(decoded).not.toBeNull()
    expect(decoded!.vendorId).toBe(vendorId)
  })

  it("token contains expected issuer and audience claims", () => {
    const token = signToken("vendor-iss-aud")
    // Decode without verification to inspect claims
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())
    expect(payload.iss).toBe("organic-canada")
    expect(payload.aud).toBe("vendor-dashboard")
  })
})

// ── authenticateVendor — COOKIE_SECRET validation ──────────────────────────

describe("authenticateVendor (COOKIE_SECRET validation)", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = VALID_SECRET
    process.env.COOKIE_SECRET = VALID_SECRET
  })

  it("rejects when COOKIE_SECRET is not set", async () => {
    delete process.env.COOKIE_SECRET
    const req = mockReq({ headers: { authorization: "Bearer some-token" } } as any)
    const res = mockRes()
    await expect(authenticateVendor(req, res, mockNext)).rejects.toThrow("COOKIE_SECRET")
  })

  it("rejects when COOKIE_SECRET is too short", async () => {
    process.env.COOKIE_SECRET = SHORT_SECRET
    const req = mockReq({ headers: { authorization: "Bearer some-token" } } as any)
    const res = mockRes()
    await expect(authenticateVendor(req, res, mockNext)).rejects.toThrow("COOKIE_SECRET")
    await expect(authenticateVendor(req, res, mockNext)).rejects.toThrow(/32 characters/)
  })

  it("does not throw with a valid COOKIE_SECRET (and invalid token — 401 is expected)", async () => {
    const req = mockReq({ headers: { authorization: "Bearer invalid-token" } } as any)
    const res = mockRes()
    // authenticateVendor will call getCookieSecret() (which passes),
    // then verify the Bearer token (which fails) and return 401.
    // It should NOT throw because getCookieSecret() succeeded.
    await expect(authenticateVendor(req, res, mockNext)).resolves.toBeUndefined()
  })
})
