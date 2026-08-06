export const USA_PRICE_APPROVAL_RETURN_PATH = "/app/usa-price-approval"
export const ADMIN_RETURN_PATH_STORAGE_KEY = "eatsie_admin_return_path"

export function safeAdminReturnPath(candidate: string): string | null {
  if (!candidate.startsWith("/app/")) return null
  if (candidate.startsWith("//") || candidate.includes(":") || candidate.includes("\\")) return null
  try {
    const parsed = new URL(candidate, "http://same-origin.invalid")
    return parsed.origin === "http://same-origin.invalid" && parsed.pathname.startsWith("/app/")
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : null
  } catch {
    return null
  }
}

/** Store only a validated in-admin destination before a login redirect. */
export function rememberAdminReturnPath(candidate: string): string | null {
  const safePath = safeAdminReturnPath(candidate)
  if (!safePath) return null
  try {
    sessionStorage.setItem(ADMIN_RETURN_PATH_STORAGE_KEY, safePath)
  } catch {
    // Storage is optional; never let its failure mask session recovery.
  }
  return safePath
}
