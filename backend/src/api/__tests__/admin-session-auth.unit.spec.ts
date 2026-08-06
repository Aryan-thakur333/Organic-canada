import * as fs from "fs"
import * as path from "path"
import { AdminApiError, adminApiRequest, resetAdminSessionExpired, shouldRetryAdminQuery } from "../../admin/lib/admin-api"
import { ADMIN_RETURN_PATH_STORAGE_KEY, safeAdminReturnPath } from "../../admin/lib/admin-session"
import { resolveAdminCookieOptions } from "../../lib/admin-cookie-options"
import { resolvePriceReviewProjectRoot } from "../admin/usa-price-review/lib/csv-helpers"

const projectRoot = path.resolve(process.cwd())
const dotEnvPath = path.join(projectRoot, ".env")
const medusaConfigPath = path.join(projectRoot, "medusa-config.ts")
const startStablePath = path.join(projectRoot, "scripts", "start-stable.js")
const middlewarePath = path.join(projectRoot, "src", "api", "middlewares.ts")

describe("Admin Authentication, Cookie, and CORS Suite", () => {
  afterEach(() => {
    resetAdminSessionExpired()
    jest.restoreAllMocks()
  })

  describe("Authentication Secrets & Configuration", () => {
    it("source .env contains JWT_SECRET and COOKIE_SECRET of at least 32 chars", () => {
      expect(fs.existsSync(dotEnvPath)).toBe(true)
      const envContent = fs.readFileSync(dotEnvPath, "utf8")

      const jwtMatch = envContent.match(/^JWT_SECRET=(.+)$/m)
      const cookieMatch = envContent.match(/^COOKIE_SECRET=(.+)$/m)

      expect(jwtMatch).not.toBeNull()
      expect(cookieMatch).not.toBeNull()

      const jwtSecret = jwtMatch![1].trim()
      const cookieSecret = cookieMatch![1].trim()

      expect(jwtSecret.length).toBeGreaterThanOrEqual(32)
      expect(cookieSecret.length).toBeGreaterThanOrEqual(32)
      expect(jwtSecret).not.toMatch(/randomBytes|randomUUID|Math\.random/)
      expect(cookieSecret).not.toMatch(/randomBytes|randomUUID|Math\.random/)
    })

    it("medusa-config.ts loads env and uses the explicit cookie policy resolver", () => {
      const configSource = fs.readFileSync(medusaConfigPath, "utf8")

      expect(configSource).toMatch(/jwtSecret:\s*process\.env\.JWT_SECRET/)
      expect(configSource).toMatch(/cookieSecret:\s*process\.env\.COOKIE_SECRET/)
      expect(configSource).toMatch(/cookieOptions:\s*resolveAdminCookieOptions/)
      expect(configSource).toContain('process.env.EATSIE_LOCAL_STABLE === "true"')
    })

    it("uses an HTTP-compatible cookie only for explicit local stable mode", () => {
      expect(resolveAdminCookieOptions({
        backendUrl: "http://localhost:9000",
        isLocalStable: true,
        nodeEnv: "production",
      })).toEqual({ httpOnly: true, secure: false, sameSite: "lax" })
    })

    it("preserves secure SameSite none cookies for production HTTPS", () => {
      expect(resolveAdminCookieOptions({
        backendUrl: "https://admin.eatsie.example",
        isLocalStable: false,
        nodeEnv: "production",
      })).toEqual({ httpOnly: true, secure: true, sameSite: "none" })
    })

    it("ADMIN_CORS and AUTH_CORS in .env contain exact Admin origin and no wildcard *", () => {
      const envContent = fs.readFileSync(dotEnvPath, "utf8")

      const adminCorsMatch = envContent.match(/^ADMIN_CORS=(.+)$/m)
      const authCorsMatch = envContent.match(/^AUTH_CORS=(.+)$/m)

      expect(adminCorsMatch).not.toBeNull()
      expect(authCorsMatch).not.toBeNull()

      const adminCors = adminCorsMatch![1].trim()
      const authCors = authCorsMatch![1].trim()

      expect(adminCors).toContain("http://localhost:9000")
      expect(authCors).toContain("http://localhost:9000")
      expect(adminCors).not.toContain("*")
      expect(authCors).not.toContain("*")
    })

    it("uses the exact stable Admin backend URL and session auth type", () => {
      const envContent = fs.readFileSync(dotEnvPath, "utf8")
      expect(envContent).toMatch(/^MEDUSA_BACKEND_URL=http:\/\/localhost:9000\s*$/m)
      expect(envContent).toMatch(/^ADMIN_AUTH_TYPE=session\s*$/m)
    })

    it("start-stable.js validates auth secrets and matches source .env without random generation", () => {
      const startStableSource = fs.readFileSync(startStablePath, "utf8")

      expect(startStableSource).toContain("validateAuthSecrets")
      expect(startStableSource).toContain("copyEnvToBuild")
      expect(startStableSource).toContain('process.env.EATSIE_LOCAL_STABLE = "true"')
      expect(startStableSource).toContain('NODE_ENV: "production"')
      expect(startStableSource).toContain("EATSIE_PROJECT_ROOT: projectRoot")
      expect(startStableSource).not.toMatch(/Math\.random|randomBytes|randomUUID/)
    })

    it("forces protected Admin responses to bypass conditional browser caches", () => {
      const middlewareSource = fs.readFileSync(middlewarePath, "utf8")

      expect(middlewareSource).toContain('const requestPath = (req.originalUrl || req.url || req.path || "").split("?")[0]')
      expect(middlewareSource).toContain('requestPath.startsWith("/admin/")')
      expect(middlewareSource).toContain("function applyAdminNoStorePolicy")
      expect(middlewareSource).toContain('const authenticateAdminUser = authenticate("user", ["session", "bearer"])')
      expect(middlewareSource).toContain("return authenticateAdminUser(req, res, next)")
      expect(middlewareSource).toContain("middlewares: [adminNoStoreAuthenticated]")
      expect(middlewareSource).toContain('delete req.headers["if-none-match"]')
      expect(middlewareSource).toContain('delete req.headers["if-modified-since"]')
      expect(middlewareSource).toContain('res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")')
      expect(middlewareSource).toContain('res.setHeader("Pragma", "no-cache")')
      expect(middlewareSource).toContain('res.setHeader("Expires", "0")')
      expect(middlewareSource).toContain('res.setHeader("Surrogate-Control", "no-store")')
    })

    it("resolves review files from the source project when stable server cwd is nested", () => {
      const stableServerCwd = path.join(projectRoot, ".medusa", "server")
      expect(resolvePriceReviewProjectRoot(stableServerCwd, projectRoot)).toBe(projectRoot)
      expect(resolvePriceReviewProjectRoot(stableServerCwd, "relative-root")).toBe(stableServerCwd)
    })
  })

  describe("Safe Admin Return Path & Session Recovery", () => {
    it("uses dedicated storage key eatsie_admin_return_path", () => {
      expect(ADMIN_RETURN_PATH_STORAGE_KEY).toBe("eatsie_admin_return_path")
    })

    it("validates safe relative /app/* paths and rejects malicious paths", () => {
      expect(safeAdminReturnPath("/app/usa-price-approval")).toBe("/app/usa-price-approval")
      expect(safeAdminReturnPath("/app/orders")).toBe("/app/orders")

      // Unsafe path rejections
      expect(safeAdminReturnPath("https://evil-site.com/app/test")).toBeNull()
      expect(safeAdminReturnPath("http://evil-site.com/app/test")).toBeNull()
      expect(safeAdminReturnPath("//evil-site.com/app/test")).toBeNull()
      expect(safeAdminReturnPath("javascript:alert(1)")).toBeNull()
      expect(safeAdminReturnPath("/admin/users/me")).toBeNull()
      expect(safeAdminReturnPath("")).toBeNull()
    })
  })

  describe("Admin API Error Classification & Retry Controls", () => {
    it("classifies HTTP 401 as session-expired with 0 retries", async () => {
      const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ message: "Unauthorized session" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        })
      )

      const promise = adminApiRequest("/admin/users/me", { maxGetAttempts: 3 })
      await expect(promise).rejects.toMatchObject({
        category: "session-expired",
        status: 401,
        message: "Unauthorized session",
      })

      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it("does not classify HTTP 401 as backend-unavailable", async () => {
      jest.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ message: "Unauthorized session" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        })
      )

      try {
        await adminApiRequest("/admin/feature-flags")
        fail("Should have thrown")
      } catch (err: any) {
        expect(err).toBeInstanceOf(AdminApiError)
        expect(err.category).not.toBe("backend-unavailable")
        expect(err.category).toBe("session-expired")
      }
    })

    it("gives React Query zero retries for every HTTP response", () => {
      expect(shouldRetryAdminQuery(0, { status: 401 })).toBe(false)
      expect(shouldRetryAdminQuery(0, { statusCode: 422 })).toBe(false)
      expect(shouldRetryAdminQuery(0, { response: { status: 500 } })).toBe(false)
    })

    it("bounds React Query transport retries to two", () => {
      expect(shouldRetryAdminQuery(0, new TypeError("Failed to fetch"))).toBe(true)
      expect(shouldRetryAdminQuery(1, new TypeError("Failed to fetch"))).toBe(true)
      expect(shouldRetryAdminQuery(2, new TypeError("Failed to fetch"))).toBe(false)
    })

    it("sends credentials same-origin and cache no-store for protected requests", async () => {
      const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )

      await adminApiRequest("/admin/usa-price-review")

      expect(fetchSpy).toHaveBeenCalledWith(
        "/admin/usa-price-review",
        expect.objectContaining({
          credentials: "same-origin",
          cache: "no-store",
        })
      )
    })

    it("never retries write HTTP methods (POST, PATCH, PUT, DELETE)", async () => {
      const fetchSpy = jest.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Network error"))

      for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
        await expect(
          adminApiRequest("/admin/usa-price-review", { method, maxGetAttempts: 3 })
        ).rejects.toBeInstanceOf(AdminApiError)
      }

      // 4 methods * 1 attempt each = 4 total calls
      expect(fetchSpy).toHaveBeenCalledTimes(4)
    })
  })

  describe("Safety & Data Protection Boundaries", () => {
    it("verifies no automated import request was initiated", () => {
      // Code inspection assertion
      const pageSource = fs.readFileSync(path.join(projectRoot, "src", "admin", "routes", "usa-price-approval", "page.tsx"), "utf8")
      expect(pageSource).not.toMatch(/fetch\(["'].*\/admin\/usa-price-review\/import["']\)/)
      expect(pageSource).not.toMatch(/adminApiRequest\(["'].*\/admin\/usa-price-review\/import["']\)/)
    })

    it("rechecks users/me before recovering review GET data and never runs writes", () => {
      const pageSource = fs.readFileSync(path.join(projectRoot, "src", "admin", "routes", "usa-price-approval", "page.tsx"), "utf8")
      const recoveryStart = pageSource.indexOf("const recoverSessionAndLoadData")
      const recoveryEnd = pageSource.indexOf("const displayedRows", recoveryStart)
      const recoverySource = pageSource.slice(recoveryStart, recoveryEnd)

      const usersMeIndex = recoverySource.indexOf("/admin/users/me")
      const reviewReloadIndex = recoverySource.indexOf("loadData(true)")
      expect(usersMeIndex).toBeGreaterThanOrEqual(0)
      expect(reviewReloadIndex).toBeGreaterThan(usersMeIndex)
      expect(recoverySource).not.toMatch(/method:\s*["'](?:POST|PATCH|PUT|DELETE)["']/)
      expect(recoverySource).not.toContain("/validate")
      expect(recoverySource).not.toContain("/dry-run")
      expect(recoverySource).not.toContain("/import")
    })

    it("stores drafts and disables protected actions during session expiry", () => {
      const pageSource = fs.readFileSync(path.join(projectRoot, "src", "admin", "routes", "usa-price-approval", "page.tsx"), "utf8")
      expect(pageSource).toContain("localStorage.setItem(DRAFT_STORAGE_KEY")
      expect(pageSource).toContain("rememberAdminReturnPath(USA_PRICE_APPROVAL_RETURN_PATH)")
      expect(pageSource).toContain("apiActionsDisabled = isNetworkError || isSessionExpired")
      expect(pageSource).toContain("if (isSessionExpired) return")
      expect(pageSource).toContain("Session Expired")
      expect(pageSource).toContain("void queryClient.cancelQueries()")
      expect(pageSource).toContain("refetchOnWindowFocus: () => !isAdminSessionExpired()")
      expect(pageSource).toContain("installProtectedAdminFetchGuard()")
      expect(pageSource).toContain("ADMIN_SESSION_EXPIRED_EVENT")
    })
  })
})
