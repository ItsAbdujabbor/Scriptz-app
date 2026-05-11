/**
 * Centralized thumbnail-thread + history-list cache updates so navigation stays
 * instant and mutations refresh data without blanket invalidations.
 */
import { thumbnailsApi } from '../../api/thumbnails'
import { getAccessTokenOrNull } from './authToken'
import { queryFreshness } from './queryConfig'
import { queryKeys } from './queryKeys'

export const chatThreadQueryOptions = {
  staleTime: queryFreshness.chatThread,
  gcTime: queryFreshness.chatThreadGc,
  /** Threads are merged explicitly; avoid refetch flicker when returning to the tab. */
  refetchOnWindowFocus: false,
}

function mergeDetailIntoListPatch(detail) {
  if (!detail || typeof detail !== 'object') return {}
  const patch = {}
  if (detail.last_message_at != null) patch.last_message_at = detail.last_message_at
  if (detail.title != null) patch.title = detail.title
  if (detail.updated_at != null) patch.updated_at = detail.updated_at
  return patch
}

function bumpRowInList(old, conversationId, patch) {
  if (!old || !Array.isArray(old.items)) return old
  const id = Number(conversationId)
  const items = [...old.items]
  const idx = items.findIndex((c) => Number(c?.id) === id)
  let row
  if (idx >= 0) {
    row = { ...items[idx], ...patch }
    items.splice(idx, 1)
  } else {
    row = { id: conversationId, ...patch }
  }
  items.unshift(row)
  return { ...old, items }
}

function removeRowFromLists(old, conversationId) {
  if (!old?.items) return old
  const id = Number(conversationId)
  return {
    ...old,
    items: old.items.filter((c) => Number(c?.id) !== id),
  }
}

export function mergeThumbnailConversationsListCache(queryClient, conversationId, detail) {
  const patch = mergeDetailIntoListPatch(detail)
  queryClient.setQueriesData({ queryKey: ['thumbnails', 'conversations'], exact: false }, (old) =>
    bumpRowInList(old, conversationId, patch)
  )
}

/** Shallow-merge `patch` into a conversation row in EVERY relevant cache —
 * the conversations list AND the conversation detail. Used for optimistic
 * activity-flag updates (is_pending, last_seen_at) where we don't want to
 * reorder the list or fabricate a row that doesn't exist yet. */
export function patchThumbnailConversationRow(queryClient, conversationId, patch) {
  if (conversationId == null) return
  const id = Number(conversationId)
  // Lists.
  queryClient.setQueriesData({ queryKey: ['thumbnails', 'conversations'], exact: false }, (old) => {
    if (!old?.items) return old
    const idx = old.items.findIndex((c) => Number(c?.id) === id)
    if (idx < 0) return old
    const items = [...old.items]
    items[idx] = { ...items[idx], ...patch }
    return { ...old, items }
  })
  // Detail (if cached).
  queryClient.setQueryData(['thumbnails', 'conversation', id], (old) =>
    old?.conversation ? { ...old, conversation: { ...old.conversation, ...patch } } : old
  )
}

/**
 * Reconcile the cached conversation detail with the latest server truth
 * AFTER a turn has already been optimistically appended (via
 * `linkLocalToServer` or the create-conversation seed).
 *
 * Important: this MERGES rather than replacing. The first-message flow
 * relies on the cache containing the user+assistant pair that was just
 * written optimistically — a wholesale `setQueryData(..., detail)` would
 * hand the message-list subtree a brand-new items array reference on
 * every send, which forces every ChatMessageItem to re-reconcile with
 * fresh prop refs and visually reads as the list "refreshing" the
 * moment the reply lands. By keeping the existing items array stable
 * (dedup-by-id, append only new ids in chronological order) we update
 * the conversation header (title auto-generated on first send,
 * last_message_at, updated_at) and the sidebar row metadata without
 * disturbing the rendered thread.
 *
 * Falls back to a straight write when the cache was empty (e.g. first
 * open of an existing conversation), so non-chat callers still get
 * server-canonical data.
 */
export async function refreshThumbnailConversationCache(queryClient, conversationId) {
  if (conversationId == null) return null
  const token = await getAccessTokenOrNull()
  if (!token) return null
  try {
    const detail = await thumbnailsApi.getConversation(token, conversationId)
    queryClient.setQueryData(queryKeys.thumbnails.conversation(conversationId), (prev) => {
      if (!prev) return detail
      const prevItems = Array.isArray(prev.messages?.items) ? prev.messages.items : []
      const incomingItems = Array.isArray(detail?.messages?.items) ? detail.messages.items : []
      const seen = new Set(prevItems.map((m) => m?.id))
      const additions = incomingItems.filter((m) => m && !seen.has(m.id))
      const mergedItems =
        additions.length === 0
          ? prevItems
          : [...prevItems, ...additions].sort((a, b) => {
              const aid = Number(a?.id)
              const bid = Number(b?.id)
              if (Number.isFinite(aid) && Number.isFinite(bid)) return aid - bid
              return 0
            })
      return {
        ...prev,
        conversation: detail?.conversation || prev.conversation,
        messages: {
          ...(prev.messages || {}),
          ...(detail?.messages || {}),
          items: mergedItems,
        },
      }
    })
    mergeThumbnailConversationsListCache(queryClient, conversationId, detail)
    return detail
  } catch {
    return null
  }
}

export async function prefetchTopThumbnailConversationDetails(queryClient, items, maxPrefetch = 6) {
  const token = await getAccessTokenOrNull()
  if (!token || !items?.length) return
  const ids = items
    .slice(0, maxPrefetch)
    .map((c) => c.id)
    .filter((id) => id != null)
  await Promise.all(
    ids.map((id) =>
      queryClient.prefetchQuery({
        queryKey: queryKeys.thumbnails.conversation(id),
        queryFn: () => thumbnailsApi.getConversation(token, id),
        ...chatThreadQueryOptions,
      })
    )
  )
}

export function removeThumbnailConversationFromListCaches(queryClient, conversationId) {
  queryClient.setQueriesData({ queryKey: ['thumbnails', 'conversations'], exact: false }, (old) =>
    removeRowFromLists(old, conversationId)
  )
}
