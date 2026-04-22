/**
 * conversationLRU — bounded LRU of recently-visited thumbnail
 * conversations.
 *
 * Why: React Query's `gcTime` lets stale cache linger indefinitely,
 * and the cache can quietly grow if the user opens dozens of chats
 * in one session. We cap the in-memory cache at the most recent N
 * (default 50) — every time a detail load succeeds, that id moves to
 * the front; if the list exceeds the cap, the oldest id is evicted
 * by removing its detail query from React Query.
 *
 * The id list (just numeric IDs — never message bodies) is mirrored
 * to localStorage so a hard reload remembers which chats were recent.
 * On boot, the order is restored so the in-memory bookkeeping picks
 * up where it left off; the actual messages re-fetch lazily on first
 * open.
 *
 * Pure module + a tiny `installConversationLRU(queryClient)` wiring
 * helper that sets up the eviction callback. Easy to unit-test by
 * importing the named functions directly without React Query.
 */

import { queryKeys } from '../../lib/query/queryKeys'

const STORAGE_KEY = 'scriptz-thumb-conv-lru-v1'
const DEFAULT_CAP = 50

let order = [] // Front = most recently used
let cap = DEFAULT_CAP
let evictHandler = null

function readPersistedIds() {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
  } catch {
    return []
  }
}

function persistIds() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order))
  } catch {
    /* quota / private mode */
  }
}

/**
 * Mark a conversation id as just-used. If the LRU is over capacity
 * after the move, evicts the oldest id by calling the registered
 * eviction handler — usually a `queryClient.removeQueries` call.
 */
export function touchConversation(conversationId) {
  if (conversationId == null) return
  const id = Number(conversationId)
  if (!Number.isFinite(id) || id <= 0) return

  // Move-to-front
  const idx = order.indexOf(id)
  if (idx !== -1) order.splice(idx, 1)
  order.unshift(id)

  // Evict overflow
  while (order.length > cap) {
    const evictedId = order.pop()
    if (evictedId != null && typeof evictHandler === 'function') {
      try {
        evictHandler(evictedId)
      } catch {
        /* eviction failure is non-fatal */
      }
    }
  }

  persistIds()
}

/**
 * Read-only snapshot of the current LRU order (front = most recent).
 * Mainly for tests — production callers shouldn't mutate this.
 */
export function getLRUOrder() {
  return order.slice()
}

/**
 * Reset internal state. Used by tests and when a user signs out.
 */
export function resetConversationLRU({ clearStorage = false } = {}) {
  order = []
  evictHandler = null
  cap = DEFAULT_CAP
  if (clearStorage && typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }
}

/**
 * Wire up the LRU to a React Query client. The returned function
 * unregisters the handler — call it on app teardown if needed.
 *
 *   installConversationLRU(queryClient, { capacity: 50 })
 */
export function installConversationLRU(queryClient, { capacity = DEFAULT_CAP } = {}) {
  cap = Math.max(1, capacity)
  // Boot from persisted state so the recent-chat order survives reloads.
  // We never restore message bodies — only the order — so the first open
  // of any restored id triggers a real fetch (which re-cycles the LRU).
  order = readPersistedIds().slice(0, cap)

  evictHandler = (evictedId) => {
    queryClient.removeQueries({
      queryKey: queryKeys.thumbnails.conversation(evictedId),
      exact: true,
    })
  }

  return () => {
    evictHandler = null
  }
}
