/**
 * thumbnailChatActivityStore — server-derived chat activity shim.
 *
 * Activity state (unread / pending) was previously tracked in Zustand +
 * localStorage. It now lives on the backend (`last_seen_at` and
 * `pending_until` columns on `thumbnail_conversations`) so it survives
 * cache clears, tab/device switches, and reload-mid-generation.
 *
 * This module preserves the original named API
 * (`useThumbnailChatActivityStore`, `markSeen`, `startPending`,
 * `clearPending`, `isPending`, `isUnread`) so existing call sites keep
 * working without churn — but everything is now derived from React
 * Query data and the new `/conversations/{id}/seen` endpoint.
 *
 * `startPending` / `clearPending` are no-ops at the client: the `/chat`
 * endpoint sets and clears the server flag; the conversation list
 * refetch surfaces it via `is_pending`.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'

import { thumbnailsApi } from '../api/thumbnails'
import { getAccessTokenOrNull } from '../lib/query/authToken'
import { queryKeys } from '../lib/query/queryKeys'

const LEGACY_STORAGE_KEY = 'scriptz_thumb_chat_activity'

// Drop the old localStorage payload on first import so we don't leave
// stale read/seen data behind on every user's machine.
try {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(LEGACY_STORAGE_KEY)
  }
} catch {}

/** Find a conversation row in any thumbnails-list cache or detail cache. */
function findRowInCache(qc, conversationId) {
  const id = Number(conversationId)
  if (!id) return null
  const lists = qc.getQueriesData({ queryKey: ['thumbnails', 'conversations'] })
  for (const [, data] of lists) {
    const row = data?.items?.find((c) => Number(c.id) === id)
    if (row) return row
  }
  const detail = qc.getQueryData(queryKeys.thumbnails.conversation(id))
  return detail?.conversation || null
}

/** Patch a conversation row across every cached list AND the detail entry. */
function patchRowEverywhere(qc, conversationId, patch) {
  const id = Number(conversationId)
  if (!id) return
  const lists = qc.getQueriesData({ queryKey: ['thumbnails', 'conversations'] })
  for (const [key, data] of lists) {
    if (!data?.items) continue
    qc.setQueryData(key, {
      ...data,
      items: data.items.map((c) =>
        Number(c.id) === id ? { ...c, ...patch } : c
      ),
    })
  }
  const detailKey = queryKeys.thumbnails.conversation(id)
  const detail = qc.getQueryData(detailKey)
  if (detail?.conversation) {
    qc.setQueryData(detailKey, {
      ...detail,
      conversation: { ...detail.conversation, ...patch },
    })
  }
}

/**
 * Hook that returns the activity API. Accepts an optional selector for
 * back-compat with callers that wrote `useThumbnailChatActivityStore((s) => s.markSeen)`.
 */
export function useThumbnailChatActivityStore(selector) {
  const queryClient = useQueryClient()

  const markSeen = useCallback(
    async (conversationId) => {
      const id = Number(conversationId)
      if (!id) return
      // Optimistically push last_seen_at forward so the dot disappears
      // instantly. Server confirmation reconciles via the response.
      patchRowEverywhere(queryClient, id, { last_seen_at: new Date().toISOString() })
      try {
        const token = await getAccessTokenOrNull()
        if (!token) return
        const updated = await thumbnailsApi.markConversationSeen(token, id)
        if (updated) {
          patchRowEverywhere(queryClient, id, {
            last_seen_at: updated.last_seen_at,
            is_pending: updated.is_pending ?? false,
          })
        }
      } catch {
        // Best-effort: a transient failure leaves the optimistic state
        // in place; next list refetch will reconcile from the server.
      }
    },
    [queryClient]
  )

  // Pending state is server-managed (see /chat route). Keeping these as
  // no-ops avoids a cascade of changes at every existing call site.
  const startPending = useCallback(() => {}, [])
  const clearPending = useCallback(() => {}, [])

  const isPending = useCallback(
    (conversationId) => {
      return Boolean(findRowInCache(queryClient, conversationId)?.is_pending)
    },
    [queryClient]
  )

  const isUnread = useCallback(
    (conversationId, lastMessageAt) => {
      const row = findRowInCache(queryClient, conversationId)
      if (row?.is_pending) return false
      const lastMsgRaw = lastMessageAt ?? row?.last_message_at
      const lastMsg = lastMsgRaw ? Date.parse(lastMsgRaw) : 0
      const lastSeen = row?.last_seen_at ? Date.parse(row.last_seen_at) : 0
      return Number.isFinite(lastMsg) && lastMsg > lastSeen
    },
    [queryClient]
  )

  // Pre-compute the legacy `pending` / `lastSeenAt` maps so old selectors
  // that reach for them keep returning sensible (server-derived) values.
  const { pending, lastSeenAt } = useMemo(() => {
    const lists = queryClient.getQueriesData({ queryKey: ['thumbnails', 'conversations'] })
    const pendingMap = {}
    const seenMap = {}
    for (const [, data] of lists) {
      if (!data?.items) continue
      for (const row of data.items) {
        const key = String(row.id)
        if (row.is_pending) pendingMap[key] = Date.now()
        if (row.last_seen_at) seenMap[key] = Date.parse(row.last_seen_at) || 0
      }
    }
    return { pending: pendingMap, lastSeenAt: seenMap }
  }, [queryClient])

  const state = {
    pending,
    lastSeenAt,
    markSeen,
    startPending,
    clearPending,
    isPending,
    isUnread,
  }
  return selector ? selector(state) : state
}
