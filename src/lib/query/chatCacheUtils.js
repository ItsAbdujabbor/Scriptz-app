/**
 * Centralized chat thread + history list cache updates so navigation stays instant
 * and mutations refresh data without blanket invalidations.
 */
import { coachApi } from '../../api/coach'
// import { scriptsApi } from '../../api/scripts' // next update — moved to src/next-update-ideas
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

export function mergeCoachConversationsListCache(queryClient, conversationId, detail) {
  const patch = mergeDetailIntoListPatch(detail)
  queryClient.setQueriesData({ queryKey: ['coach', 'conversations'], exact: false }, (old) =>
    bumpRowInList(old, conversationId, patch)
  )
}

export function mergeScriptConversationsListCache(queryClient, conversationId, detail) {
  const patch = mergeDetailIntoListPatch(detail)
  queryClient.setQueriesData({ queryKey: ['scripts', 'conversations'], exact: false }, (old) =>
    bumpRowInList(old, conversationId, patch)
  )
}

export function mergeThumbnailConversationsListCache(queryClient, conversationId, detail) {
  const patch = mergeDetailIntoListPatch(detail)
  queryClient.setQueriesData({ queryKey: ['thumbnails', 'conversations'], exact: false }, (old) =>
    bumpRowInList(old, conversationId, patch)
  )
}

export async function refreshCoachConversationCache(queryClient, conversationId) {
  if (conversationId == null) return null
  const token = await getAccessTokenOrNull()
  if (!token) return null
  try {
    const detail = await coachApi.getConversation(token, conversationId)
    queryClient.setQueryData(queryKeys.coach.conversation(conversationId), detail)
    mergeCoachConversationsListCache(queryClient, conversationId, detail)
    return detail
  } catch {
    return null
  }
}

export async function refreshScriptConversationCache(_queryClient, _conversationId) {
  return null // next update — scriptsApi moved to src/next-update-ideas/ScriptGenerator
}

export async function refreshThumbnailConversationCache(queryClient, conversationId) {
  if (conversationId == null) return null
  const token = await getAccessTokenOrNull()
  if (!token) return null
  try {
    const detail = await thumbnailsApi.getConversation(token, conversationId)
    queryClient.setQueryData(queryKeys.thumbnails.conversation(conversationId), detail)
    mergeThumbnailConversationsListCache(queryClient, conversationId, detail)
    return detail
  } catch {
    return null
  }
}

/**
 * Prefetch first N thread payloads after history lists load (sidebar / app init).
 */
export async function prefetchTopCoachConversationDetails(queryClient, items, maxPrefetch = 6) {
  const token = await getAccessTokenOrNull()
  if (!token || !items?.length) return
  const ids = items
    .slice(0, maxPrefetch)
    .map((c) => c.id)
    .filter((id) => id != null)
  await Promise.all(
    ids.map((id) =>
      queryClient.prefetchQuery({
        queryKey: queryKeys.coach.conversation(id),
        queryFn: () => coachApi.getConversation(token, id),
        ...chatThreadQueryOptions,
      })
    )
  )
}

export async function prefetchTopScriptConversationDetails(_queryClient, _items, _maxPrefetch = 6) {
  // next update — scriptsApi moved to src/next-update-ideas/ScriptGenerator
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

export function removeCoachConversationFromListCaches(queryClient, conversationId) {
  queryClient.setQueriesData({ queryKey: ['coach', 'conversations'], exact: false }, (old) =>
    removeRowFromLists(old, conversationId)
  )
}

export function removeScriptConversationFromListCaches(queryClient, conversationId) {
  queryClient.setQueriesData({ queryKey: ['scripts', 'conversations'], exact: false }, (old) =>
    removeRowFromLists(old, conversationId)
  )
}

export function removeThumbnailConversationFromListCaches(queryClient, conversationId) {
  queryClient.setQueriesData({ queryKey: ['thumbnails', 'conversations'], exact: false }, (old) =>
    removeRowFromLists(old, conversationId)
  )
}
