export type AdminCookieOptions = {
  httpOnly: true
  secure: boolean
  sameSite: "lax" | "none"
}

type AdminCookieEnvironment = {
  backendUrl?: string
  isLocalStable: boolean
  nodeEnv?: string
}

/**
 * Resolve the browser-session cookie policy without weakening HTTPS runtimes.
 * Stable local mode is deliberately explicit because `medusa start` runs with
 * production semantics even though the Admin is served over plain localhost.
 */
export function resolveAdminCookieOptions({
  backendUrl,
  isLocalStable,
  nodeEnv,
}: AdminCookieEnvironment): AdminCookieOptions {
  if (isLocalStable) {
    return { httpOnly: true, secure: false, sameSite: "lax" }
  }

  const secure = backendUrl?.startsWith("https://") || nodeEnv === "production"
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
  }
}
