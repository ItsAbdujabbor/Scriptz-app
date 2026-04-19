/**
 * thumbnailChatActivityStore — tracks two pieces of per-conversation state
 * that the backend doesn't need to know about:
 *
 *   1. `pending`  — conversation IDs that currently have a generation in
 *      flight. Used by the sidebar to render a spinner badge next to the
 *      row so the user can see "still processing" even after they
 *      navigate away from the chat.
 *
 *   2. `lastSeenAt` — per-conversation timestamp of the last time the
 *      user actually viewed the conversation. Compared against
 *      `last_message_at` (from the API) to derive an "unread" dot when a
 *      generation finishes while the user is elsewhere.
 *
 * Both are persisted to localStorage so a page reload doesn't lose the
 * dot/spinner state. The spinner expires itself after a safety timeout
 * to avoid a stuck UI if a background request ever fails silently.
 */
import { create } from 'zustand'

const STORAGE_KEY = 'scriptz_thumb_chat_activity'
const PENDING_SAFETY_TIMEOUT_MS = 5 * 60 * 1000 // 5 min — generations always settle well before this

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { pending: {}, lastSeenAt: {} }
    const parsed = JSON.parse(raw)
    return {
      pending: parsed?.pending && typeof parsed.pending === 'object' ? parsed.pending : {},
      lastSeenAt:
        parsed?.lastSeenAt && typeof parsed.lastSeenAt === 'object' ? parsed.lastSeenAt : {},
    }
  } catch {
    return { pending: {}, lastSeenAt: {} }
  }
}

function saveStored(state) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ pending: state.pending, lastSeenAt: state.lastSeenAt })
    )
  } catch {}
}

const initial = loadStored()

// Auto-clear any pending entries older than the safety timeout on load
// (covers the "crashed mid-generation" case so the UI isn't stuck).
const now = Date.now()
const cleanedPending = {}
Object.entries(initial.pending).forEach(([id, startedAt]) => {
  if (typeof startedAt === 'number' && now - startedAt < PENDING_SAFETY_TIMEOUT_MS) {
    cleanedPending[id] = startedAt
  }
})

export const useThumbnailChatActivityStore = create((set, get) => ({
  pending: cleanedPending,
  lastSeenAt: initial.lastSeenAt,

  /** Mark a conversation as actively generating. */
  startPending(conversationId) {
    const id = String(conversationId)
    if (!id) return
    const pending = { ...get().pending, [id]: Date.now() }
    set({ pending })
    saveStored({ pending, lastSeenAt: get().lastSeenAt })
  },

  /** Mark a conversation as done generating (success or error). */
  clearPending(conversationId) {
    const id = String(conversationId)
    if (!id) return
    const { [id]: _removed, ...rest } = get().pending
    set({ pending: rest })
    saveStored({ pending: rest, lastSeenAt: get().lastSeenAt })
  },

  /** Record "user viewed this conversation now" — clears the unread dot. */
  markSeen(conversationId, ts) {
    const id = String(conversationId)
    if (!id) return
    const seenAt = typeof ts === 'number' ? ts : Date.now()
    const lastSeenAt = { ...get().lastSeenAt, [id]: seenAt }
    set({ lastSeenAt })
    saveStored({ pending: get().pending, lastSeenAt })
  },

  /** True when a sidebar row should render the spinner badge. */
  isPending(conversationId) {
    return Boolean(get().pending[String(conversationId)])
  },

  /** Compare last_message_at (from API) to our local "seen" stamp. */
  isUnread(conversationId, lastMessageAt) {
    if (!lastMessageAt) return false
    const id = String(conversationId)
    // If we're still generating, it's not unread yet — it's pending.
    if (get().pending[id]) return false
    const last = typeof lastMessageAt === 'string' ? Date.parse(lastMessageAt) : lastMessageAt
    if (!Number.isFinite(last)) return false
    const seen = get().lastSeenAt[id] || 0
    return last > seen
  },
}))
