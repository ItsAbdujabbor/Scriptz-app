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

// RT-03: a BroadcastChannel holds an open IPC port until explicitly
// closed. Without this, navigating away / bfcache eviction leaks the
// port (and its message queue). Register the unload close exactly once.
let _unloadHooked = false
function hookUnloadClose() {
  if (_unloadHooked || typeof window === 'undefined') return
  _unloadHooked = true
  // `pagehide` fires for both normal unload and bfcache freeze and is
  // more reliable than `beforeunload` on mobile Safari.
  window.addEventListener('pagehide', () => {
    if (_channel) {
      try {
        _channel.close()
      } catch {
        /* already closing/closed — ignore */
      }
      _channel = null
    }
  })
}

function getChannel() {
  if (typeof window === 'undefined') return null
  if (typeof BroadcastChannel === 'undefined') return null
  if (_channel) return _channel
  try {
    _channel = new BroadcastChannel(CHANNEL_NAME)
    hookUnloadClose()
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
    } catch (err) {
      // STM-07: never let a handler error kill the listener — but a
      // silently-swallowed error here previously hid real cross-tab
      // cache-sync bugs (a malformed delta would just vanish). Log it
      // so it's visible in the console / error reporting.
      console.error('[broadcastSync] Cache event handler error:', err, 'event:', e?.data)
    }
  }
  ch.addEventListener('message', listener)
  return () => ch.removeEventListener('message', listener)
}
