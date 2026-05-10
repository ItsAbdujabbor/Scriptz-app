/**
 * Cross-tab cache sync via BroadcastChannel.
 *
 * Problem: when the same user has the app open in two browser tabs,
 * a mutation in tab A (e.g. send a chat message, persist a failure
 * event) updates the React Query cache in tab A but tab B's cache
 * stays stale until a manual refetch or the 5-minute staleTime
 * expires. This is especially visible on the conversation detail
 * cache, where a tab B viewer of the same chat sees the message
 * "vanish" if they switch tabs and back.
 *
 * Solution: post a small message over BroadcastChannel whenever we
 * mutate the conversation cache (`hydrateConversationCache` is the
 * single chokepoint). Each tab listens, applies the same `setQueryData`
 * locally, so all tabs converge to the same state without an extra
 * network fetch.
 *
 * The channel name is namespaced (`clixa-cache`) so it can't collide
 * with browser DevTools or other apps on the same origin.
 *
 * Falls back to a no-op when BroadcastChannel isn't available
 * (Safari < 15.4, some old in-app webviews).
 */

const CHANNEL_NAME = 'clixa-cache'

let _channel = null

function getChannel() {
  if (typeof window === 'undefined') return null
  if (typeof BroadcastChannel === 'undefined') return null
  if (_channel) return _channel
  try {
    _channel = new BroadcastChannel(CHANNEL_NAME)
  } catch {
    _channel = null
  }
  return _channel
}

/**
 * Post a cache-mutation event to other tabs. `payload` should be a
 * plain JSON-serializable object describing what changed; subscribers
 * decide how to apply it locally. We don't broadcast the entire
 * QueryClient state — only the minimal delta the receiver needs.
 *
 * Shapes currently used:
 *   { kind: 'conversation:append', conversationId, items: [serverMessage, ...] }
 *   { kind: 'conversation:invalidate', conversationId }
 *   { kind: 'conversations:invalidate' }  // sidebar list
 */
export function broadcastCacheEvent(payload) {
  const ch = getChannel()
  if (!ch) return
  try {
    ch.postMessage(payload)
  } catch {
    /* serialization failure — ignore */
  }
}

/**
 * Subscribe a handler to incoming cache-mutation events. Returns an
 * unsubscribe function. Wire from the query-client setup so the same
 * handler runs in every tab.
 */
export function subscribeCacheEvents(handler) {
  const ch = getChannel()
  if (!ch) return () => {}
  const listener = (e) => {
    try {
      handler(e.data)
    } catch {
      /* never let a handler error kill the listener */
    }
  }
  ch.addEventListener('message', listener)
  return () => ch.removeEventListener('message', listener)
}
