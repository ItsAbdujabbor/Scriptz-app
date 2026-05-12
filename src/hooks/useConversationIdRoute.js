/**
 * useConversationIdRoute — hash-router bridge for the thumbnail
 * conversation id.
 *
 * Phase 3.4 of the architectural rewrite. The current Thumbnails.jsx
 * keeps the parse/serialize hash logic inline; this hook factors it
 * out so:
 *
 *   * The new ThumbnailScreen can simply destructure
 *     `[conversationId, setConversationId] = useConversationIdRoute()`.
 *
 *   * Other surfaces (the sidebar, settings, the future "open chat
 *     from URL share" path) reuse the same parser.
 *
 *   * Tests don't have to render the whole component to verify route
 *     transitions.
 *
 * Hash format (preserved from the legacy code):
 *   `#thumbnails`           → conversationId = null  (new chat surface)
 *   `#thumbnails?id=42`     → conversationId = 42
 *
 * No closure-timing bugs: `setConversationId` writes the hash, the
 * `hashchange` listener flips local state, the React tree re-renders.
 * State and the URL stay synchronized through the browser's
 * `hashchange` event — no ref bookkeeping, no manual sync.
 */
import { useCallback, useEffect, useState } from 'react'

const ROUTE_PREFIX = 'thumbnails'

function normalizeHashRoute(value) {
  return String(value || '')
    .replace(/^#/, '')
    .replace(/^\/+/, '')
    .trim()
}

/**
 * Parse the current `window.location.hash` for the thumbnails route's
 * conversation id. Returns null for the new-chat surface
 * (`#thumbnails`) or when the URL is anywhere else.
 *
 * Exported as a standalone helper so other modules can read the same
 * value without depending on React's lifecycle.
 */
export function parseConversationIdFromHash() {
  if (typeof window === 'undefined') return null
  const raw = normalizeHashRoute(window.location.hash)
  if (!raw.startsWith(ROUTE_PREFIX)) return null
  const q = raw.indexOf('?')
  if (q === -1) return null
  const params = new URLSearchParams(raw.slice(q + 1))
  const id = params.get('id')
  const n = id == null ? NaN : Number(id)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Serialize a conversation id back into the hash. Null → the new-chat
 * surface; numeric id → `#thumbnails?id=N`. Triggers a `hashchange`
 * event which the listener inside `useConversationIdRoute` picks up.
 */
export function writeConversationIdToHash(conversationId) {
  if (typeof window === 'undefined') return
  const next = conversationId ? `#${ROUTE_PREFIX}?id=${conversationId}` : `#${ROUTE_PREFIX}`
  if (window.location.hash !== next) {
    window.location.hash = next
  }
}

/**
 * Reactive [conversationId, setConversationId] tuple wired to the
 * URL hash. The setter writes the URL; the listener observes the
 * change and re-renders with the new state.
 */
export function useConversationIdRoute() {
  const [conversationId, setLocalId] = useState(parseConversationIdFromHash)

  useEffect(() => {
    const onHashChange = () => setLocalId(parseConversationIdFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const setConversationId = useCallback((next) => {
    writeConversationIdToHash(next)
  }, [])

  return [conversationId, setConversationId]
}
