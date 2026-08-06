type AdminFetchOptions = RequestInit & {
  query?: Record<string, string | number | undefined | null>
}

export async function adminFetch<T>(path: string, options: AdminFetchOptions = {}): Promise<T> {
  const { query, headers, ...init } = options
  const params = new URLSearchParams()

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value))
    }
  })

  const url = params.size ? `${path}?${params.toString()}` : path
  const response = await fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(headers || {}),
    },
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(data.message || "Admin request failed")
  }

  return data as T
}

