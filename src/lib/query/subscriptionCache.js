/**
 * Lightweight localStorage cache for the subscription payload.
 *
 * Why this exists:
 *   `/api/billing/subscription` is the source of truth that gates EVERY Pro
 *   feature in the UI (sidebar plan name, paywall callouts, persona/style
 *   pickers, credits badge, etc.). With no cache, every page reload starts
 *   with `tier: 'free'` for a few hundred ms — Pro users see the "Free"
 *   placeholder flash before the React Query fetch returns.
 *
 *   Persisting the last-known subscription to localStorage and seeding
 *   React Query's cache from it on app boot eliminates that flash. The
 *   network refetch still runs in the background and overwrites the
 *   cache the moment fresh data arrives, so the UI is always within one
 *   tick of the server's truth.
 *
 * Storage shape:
 *   key:   "clixa_sub_cache_v1"
 *   value: { v: 1, ts: <epoch_ms>, sub: <SubscriptionOut payload> }
 *
 *   Wrapping the payload with a version + timestamp lets us evolve the
 *   shape later without parsing junk written by an older build, and lets
 *   us age out stale entries (24h ceiling — see MAX_AGE_MS).
 *
 *   Logout MUST call `clearSubscriptionCache()` (wired into
 *   `lib/sessionReset.js`) so a different user signing in on the same
 *   browser doesn't briefly see the previous user's tier.
 */
const KEY = 'clixa_sub_cache_v1'
const VERSION = 1

// 24 hours. Server cache is 2 minutes and React Query refetches every
// 15s while the app is open, so anything older than 24h is almost
// certainly from a stale tab the user closed days ago — safer to drop
// it than to flash an old plan.
const MAX_AGE_MS = 24 * 60 * 60 * 1000

/**
 * Read the cached subscription payload. Returns the parsed
 * `SubscriptionOut` object on success, `null` on absence / malformed
 * JSON / version skew / age-out.
 */
export function loadCachedSubscription() {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.v !== VERSION) return null
    if (typeof parsed.ts !== 'number' || Date.now() - parsed.ts > MAX_AGE_MS) {
      return null
    }
    if (!parsed.sub || typeof parsed.sub !== 'object') return null
    return parsed.sub
  } catch {
    return null
  }
}

/**
 * Persist a subscription payload to localStorage. Pass `null` /
 * `undefined` to clear (same as `clearSubscriptionCache`). The wrapper
 * adds version + timestamp so future readers can validate freshness.
 */
export function cacheSubscription(sub) {
  if (typeof localStorage === 'undefined') return
  try {
    if (!sub || typeof sub !== 'object') {
      localStorage.removeItem(KEY)
      return
    }
    localStorage.setItem(
      KEY,
      JSON.stringify({ v: VERSION, ts: Date.now(), sub })
    )
  } catch {
    /* storage may be blocked (incognito, quota) — silent fail. The
     * UI will still work; it just won't get the no-flash benefit on
     * the next reload. */
  }
}

export function clearSubscriptionCache() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* same as above — silent fail. */
  }
}
