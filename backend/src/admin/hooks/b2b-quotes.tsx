import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { adminFetch } from "../lib/sdk"
import type { B2BQuote, B2BQuoteListResponse, B2BQuoteMessage } from "../types"

export const b2bQuoteKeys = {
  lists: ["b2b-quotes"] as const,
  list: (params: Record<string, any>) => ["b2b-quotes", params] as const,
  detail: (id?: string) => ["b2b-quotes", id] as const,
  messages: (id?: string) => ["b2b-quotes", id, "messages"] as const,
}

export function useB2BQuotes(params: {
  status?: string
  q?: string
  limit?: number
  offset?: number
} = {}) {
  return useQuery({
    queryKey: b2bQuoteKeys.list(params),
    queryFn: () =>
      adminFetch<B2BQuoteListResponse>("/admin/b2b-quotes", {
        query: {
          limit: params.limit ?? 100,
          offset: params.offset ?? 0,
          status: params.status,
          q: params.q,
        },
      }),
  })
}

export function useB2BQuote(id?: string) {
  return useQuery({
    queryKey: b2bQuoteKeys.detail(id),
    enabled: Boolean(id),
    queryFn: () => adminFetch<{ quote: B2BQuote }>(`/admin/b2b-quotes/${id}`),
  })
}

export function useSendB2BQuote(id?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: { admin_note?: string }) =>
      adminFetch<{ quote: B2BQuote; message: string }>(`/admin/b2b-quotes/${id}/send`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: b2bQuoteKeys.lists })
      queryClient.invalidateQueries({ queryKey: b2bQuoteKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: b2bQuoteKeys.messages(id) })
    },
  })
}

export function useSaveB2BQuoteNegotiatedTotal(id?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: { negotiated_total: number | string; admin_note?: string | null }) =>
      adminFetch<{ quote: B2BQuote; message: string }>(`/admin/b2b-quotes/${id}/negotiated-total`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: b2bQuoteKeys.lists })
      queryClient.invalidateQueries({ queryKey: b2bQuoteKeys.detail(id) })
    },
  })
}

export function useRejectB2BQuote(id?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: { reason: string; admin_note?: string }) =>
      adminFetch<{ quote: B2BQuote; message: string }>(`/admin/b2b-quotes/${id}/reject`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: b2bQuoteKeys.lists })
      queryClient.invalidateQueries({ queryKey: b2bQuoteKeys.detail(id) })
    },
  })
}

export function useUpdateB2BQuoteItem(id?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: { item_id: string; quantity?: number; unit_price?: number }) =>
      adminFetch<{ quote: B2BQuote; message: string }>(
        `/admin/b2b-quotes/${id}/items/${payload.item_id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            quantity: payload.quantity,
            unit_price: payload.unit_price,
          }),
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: b2bQuoteKeys.lists })
      queryClient.invalidateQueries({ queryKey: b2bQuoteKeys.detail(id) })
    },
  })
}

export function useB2BQuoteMessages(id?: string) {
  return useQuery({
    queryKey: b2bQuoteKeys.messages(id),
    enabled: Boolean(id),
    refetchInterval: 3000,
    queryFn: () => adminFetch<{ messages: B2BQuoteMessage[] }>(`/admin/b2b-quotes/${id}/messages`),
  })
}

export function useCreateB2BQuoteMessage(id?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: { message: string }) =>
      adminFetch<{ message: B2BQuoteMessage }>(`/admin/b2b-quotes/${id}/messages`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: b2bQuoteKeys.messages(id) })
    },
  })
}
