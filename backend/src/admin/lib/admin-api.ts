export type AdminApiFailureCategory =
  | "session-expired"
  | "validation-error"
  | "route-not-found"
  | "conflict"
  | "server-error"
  | "backend-unavailable"

export class AdminApiError extends Error {
  constructor(
    public readonly category: AdminApiFailureCategory,
    public readonly status: number | null,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message)
    this.name = "AdminApiError"
  }
}

export type AdminApiRequestOptions = RequestInit & {
  timeoutMs?: number
  maxGetAttempts?: number
}

export const ADMIN_SESSION_EXPIRED_EVENT = "eatsie:admin-session-expired"

let protectedSessionExpired = false
const activeProtectedControllers = new Set<AbortController>()
let protectedFetchGuardInstalled = false

function isProtectedAdminPath(path: string): boolean {
  return path === "/admin" || path.startsWith("/admin/")
}

function sessionExpiredError(): AdminApiError {
  return new AdminApiError("session-expired", 401, "Admin session has expired")
}

function markProtectedSessionExpired(currentController?: AbortController): void {
  const wasExpired = protectedSessionExpired
  protectedSessionExpired = true
  for (const controller of activeProtectedControllers) {
    if (controller !== currentController) controller.abort()
  }
  if (!wasExpired && typeof window !== "undefined") {
    window.dispatchEvent(new Event(ADMIN_SESSION_EXPIRED_EVENT))
  }
}

/** Reset only after an explicit user-driven authentication recheck. */
export function resetAdminSessionExpired(): void {
  protectedSessionExpired = false
}

export function isAdminSessionExpired(): boolean {
  return protectedSessionExpired
}

export function cancelActiveProtectedRequests(): void {
  for (const controller of activeProtectedControllers) controller.abort()
}

function requestPath(input: RequestInfo | URL): string {
  const raw = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url
  try {
    return new URL(raw, typeof window !== "undefined" ? window.location.origin : "http://same-origin.invalid").pathname
  } catch {
    return raw.split("?")[0]
  }
}

/**
 * Covers Medusa Admin's own protected fetches without changing its providers.
 * Once any /admin request returns 401, later protected attempts are answered
 * locally until a successful /auth/session explicitly resets the circuit.
 */
export function createProtectedAdminFetchGuard(nativeFetch: typeof fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = requestPath(input)
    const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase()
    if (isProtectedAdminPath(path) && protectedSessionExpired) {
      return new Response(JSON.stringify({ message: "Admin session has expired" }), {
        status: 401,
        headers: { "content-type": "application/json", "x-eatsie-session-guard": "blocked" },
      })
    }

    const response = await nativeFetch(input, init)
    if (path === "/auth/session" && method === "POST" && response.ok) {
      resetAdminSessionExpired()
    } else if (isProtectedAdminPath(path) && response.status === 401) {
      markProtectedSessionExpired()
    }
    return response
  }
}

export function installProtectedAdminFetchGuard(): void {
  if (protectedFetchGuardInstalled || typeof window === "undefined") return
  const nativeFetch = globalThis.fetch.bind(globalThis)
  globalThis.fetch = createProtectedAdminFetchGuard(nativeFetch)
  protectedFetchGuardInstalled = true
}

function httpStatusFromError(error: unknown): number | null {
  if (!error || typeof error !== "object") return null
  const candidate = error as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } }
  for (const value of [candidate.status, candidate.statusCode, candidate.response?.status]) {
    if (typeof value === "number" && Number.isInteger(value) && value >= 100) return value
  }
  return null
}

/** React Query policy: HTTP failures never retry; transport failures retry at most twice. */
export function shouldRetryAdminQuery(failureCount: number, error: unknown): boolean {
  if (protectedSessionExpired) return false
  if (httpStatusFromError(error) !== null) return false
  return failureCount < 2
}

function categoryForStatus(status: number): AdminApiFailureCategory {
  if (status === 401) return "session-expired"
  if (status === 400 || status === 422) return "validation-error"
  if (status === 404) return "route-not-found"
  if (status === 409) return "conflict"
  return "server-error"
}

function payloadMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message
    if (typeof message === "string" && message.trim()) return message.slice(0, 500)
  }
  if (typeof payload === "string" && payload.trim()) return payload.trim().slice(0, 500)
  return fallback
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return undefined
  const contentType = response.headers.get("content-type") || ""
  if (contentType.includes("application/json")) return response.json().catch(() => undefined)
  return response.text().catch(() => undefined)
}

function waitForBackoff(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms))
}

/**
 * Same-origin Admin request with a bounded timeout. Only safe GET requests
 * retry transient network failures; HTTP responses and write methods are
 * always attempted once. In particular, a 401 is terminal session state.
 */
export async function adminApiRequest<T>(path: string, options: AdminApiRequestOptions = {}): Promise<T> {
  const { timeoutMs = 12_000, maxGetAttempts = 2, ...init } = options
  const method = String(init.method || "GET").toUpperCase()
  const protectedRequest = isProtectedAdminPath(path)
  if (protectedRequest && protectedSessionExpired) throw sessionExpiredError()
  const attempts = method === "GET" ? Math.max(1, Math.min(maxGetAttempts, 3)) : 1
  let lastError: AdminApiError | undefined

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController()
    if (protectedRequest) activeProtectedControllers.add(controller)
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs)
    const startedAt = performance.now()
    try {
      const response = await fetch(path, {
        ...init,
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(init.headers || {}),
        },
      })
      const payload = await parseResponseBody(response)
      const requestId = response.headers.get("x-request-id") || undefined
      if (!response.ok) {
        if (response.status === 401 && protectedRequest) {
          markProtectedSessionExpired(controller)
        }
        const apiError = new AdminApiError(
          categoryForStatus(response.status),
          response.status,
          payloadMessage(payload, `Request failed (HTTP ${response.status})`),
          requestId,
        )
        throw apiError
      }
      console.info("[ADMIN_API]", { route: path, method, status: response.status, duration_ms: Math.round(performance.now() - startedAt), request_id: requestId })
      return payload as T
    } catch (error) {
      if (error instanceof AdminApiError) throw error
      if (protectedRequest && protectedSessionExpired) throw sessionExpiredError()
      const isAbort = Boolean(error && typeof error === "object" && "name" in error && (error as { name?: unknown }).name === "AbortError")
      const message = isAbort ? "Request timed out" : "Backend is unavailable"
      lastError = new AdminApiError("backend-unavailable", null, message)
      console.warn("[ADMIN_API]", { route: path, method, category: "backend-unavailable", duration_ms: Math.round(performance.now() - startedAt), attempt })
      if (method === "GET" && attempt < attempts) {
        await waitForBackoff(150 * attempt)
        continue
      }
      throw lastError
    } finally {
      globalThis.clearTimeout(timeout)
      if (protectedRequest) activeProtectedControllers.delete(controller)
    }
  }
  throw lastError || new AdminApiError("backend-unavailable", null, "Backend is unavailable")
}
