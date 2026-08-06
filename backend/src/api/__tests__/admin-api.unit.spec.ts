import { AdminApiError, adminApiRequest, createProtectedAdminFetchGuard, isAdminSessionExpired, resetAdminSessionExpired } from "../../admin/lib/admin-api"
import { ADMIN_RETURN_PATH_STORAGE_KEY, safeAdminReturnPath } from "../../admin/lib/admin-session"

function response(body: string | null, status: number, contentType = "application/json", requestId?: string): Response {
  const headers = new Headers()
  if (contentType) headers.set("content-type", contentType)
  if (requestId) headers.set("x-request-id", requestId)
  return new Response(body, { status, headers })
}

describe("adminApiRequest", () => {
  afterEach(() => {
    resetAdminSessionExpired()
    jest.restoreAllMocks()
  })

  it("parses JSON and enforces same-origin/no-store", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(response('{"ok":true}', 200))
    await expect(adminApiRequest<{ ok: boolean }>("/admin/example")).resolves.toEqual({ ok: true })
    expect(fetchSpy).toHaveBeenCalledWith("/admin/example", expect.objectContaining({ credentials: "same-origin", cache: "no-store" }))
  })

  it("handles an empty 204 response", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(response(null, 204, ""))
    await expect(adminApiRequest<void>("/admin/example")).resolves.toBeUndefined()
  })

  it.each([
    [401, "session-expired"],
    [400, "validation-error"],
    [422, "validation-error"],
    [404, "route-not-found"],
    [409, "conflict"],
    [500, "server-error"],
  ] as const)("classifies HTTP %i as %s", async (status, category) => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(response('{"message":"safe detail"}', status, "application/json", "req_test"))
    const result = adminApiRequest("/admin/example", { maxGetAttempts: 1 })
    await expect(result).rejects.toMatchObject({ category, status, message: "safe detail", requestId: "req_test" })
  })

  it("does not retry a 401, even when GET retries are configured", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(response('{"message":"expired"}', 401))
    await expect(adminApiRequest("/admin/example", { maxGetAttempts: 3 })).rejects.toMatchObject({ category: "session-expired" })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(isAdminSessionExpired()).toBe(true)
  })

  it("blocks later protected requests after the first 401 until explicit recovery", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response('{"message":"expired"}', 401))
      .mockResolvedValue(response('{"ok":true}', 200))

    await expect(adminApiRequest("/admin/users/me")).rejects.toMatchObject({ category: "session-expired" })
    await expect(adminApiRequest("/admin/feature-flags")).rejects.toMatchObject({ category: "session-expired" })
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    resetAdminSessionExpired()
    await expect(adminApiRequest<{ ok: boolean }>("/admin/feature-flags")).resolves.toEqual({ ok: true })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it("resets the global protected-request circuit only after successful auth session creation", async () => {
    const nativeFetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(response('{"message":"expired"}', 401))
      .mockResolvedValueOnce(response('{"ok":true}', 200))
      .mockResolvedValueOnce(response('{"ok":true}', 200))
    const guardedFetch = createProtectedAdminFetchGuard(nativeFetch)

    await expect(guardedFetch("/admin/users/me")).resolves.toMatchObject({ status: 401 })
    const blocked = await guardedFetch("/admin/feature-flags")
    expect(blocked.status).toBe(401)
    expect(blocked.headers.get("x-eatsie-session-guard")).toBe("blocked")
    expect(nativeFetch).toHaveBeenCalledTimes(1)

    await expect(guardedFetch("/auth/session", { method: "POST" })).resolves.toMatchObject({ status: 200 })
    await expect(guardedFetch("/admin/feature-flags")).resolves.toMatchObject({ status: 200 })
    expect(nativeFetch).toHaveBeenCalledTimes(3)
  })

  it("cancels another active protected request when a peer returns 401", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockImplementation((path, init) => {
      if (path === "/admin/slow") {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject({ name: "AbortError" }))
        })
      }
      return Promise.resolve(response('{"message":"expired"}', 401))
    })

    const activeRequest = adminApiRequest("/admin/slow", { maxGetAttempts: 1 })
    await expect(adminApiRequest("/admin/users/me", { maxGetAttempts: 1 })).rejects.toMatchObject({ category: "session-expired" })
    await expect(activeRequest).rejects.toMatchObject({ category: "session-expired" })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it.each([400, 404, 409, 422, 500])("does not retry HTTP %i", async (status) => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockResolvedValue(response(null, status))
    await expect(adminApiRequest("/admin/example", { maxGetAttempts: 3 })).rejects.toBeInstanceOf(AdminApiError)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it("handles non-JSON error responses safely", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(response("plain failure", 500, "text/plain"))
    await expect(adminApiRequest("/admin/example", { maxGetAttempts: 1 })).rejects.toMatchObject({ message: "plain failure" })
  })

  it("classifies a network rejection as backend-unavailable", async () => {
    jest.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("failed to fetch"))
    await expect(adminApiRequest("/admin/example", { maxGetAttempts: 1 })).rejects.toMatchObject({ category: "backend-unavailable", status: null })
  })

  it("classifies a timeout as backend-unavailable", async () => {
    jest.useFakeTimers()
    try {
      jest.spyOn(globalThis, "fetch").mockImplementation((_path, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject({ name: "AbortError" }))
      }))
      const pending = adminApiRequest("/admin/example", { timeoutMs: 10, maxGetAttempts: 1 })
      const rejection = expect(pending).rejects.toMatchObject({ category: "backend-unavailable", message: "Request timed out" })
      await jest.advanceTimersByTimeAsync(10)
      await rejection
    } finally {
      jest.useRealTimers()
    }
  })

  it("bounds GET retries", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"))
    await expect(adminApiRequest("/admin/example", { maxGetAttempts: 2 })).rejects.toBeInstanceOf(AdminApiError)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it.each(["POST", "PUT", "PATCH", "DELETE"])("never retries %s", async (method) => {
    const fetchSpy = jest.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"))
    await expect(adminApiRequest("/admin/example", { method, maxGetAttempts: 3 })).rejects.toBeInstanceOf(AdminApiError)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe("safeAdminReturnPath", () => {
  it("accepts same-origin Admin paths", () => {
    expect(safeAdminReturnPath("/app/usa-price-approval")).toBe("/app/usa-price-approval")
  })

  it("uses a single dedicated return-path storage key", () => {
    expect(ADMIN_RETURN_PATH_STORAGE_KEY).toBe("eatsie_admin_return_path")
  })

  it.each(["https://evil.example/app/x", "http://evil.example", "//evil.example/app/x", "/store/x", "/app/../../outside", "/app\\evil"])("rejects unsafe return path %s", (candidate) => {
    expect(safeAdminReturnPath(candidate)).toBeNull()
  })
})
