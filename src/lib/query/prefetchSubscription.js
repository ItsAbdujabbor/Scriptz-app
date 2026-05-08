/**
 * Two-phase subscription warm-up: seed the React Query cache from
 * localStorage IMMEDIATELY (sync), then revalidate from the server.
 *
 * Phase 1 — sync seed (`seedSubscriptionFromCache`):
 *   Called the moment App.jsx mounts. Reads any cached payload from
 *   localStorage and writes it into React Query's cache via
 *   `setQueryData(queryKeys.billing.subscription, ...)`. By the time
 *   Sidebar / ThumbnailGenerator / CreditsBadge / etc. read the query,
 *   the data is already there — first paint shows the correct Pro
 *   state instead of flashing "Free".
 *
 * Phase 2 — async revalidate (`prefetchSubscription`):
 *   Called after `ensureSession()` resolves. Hits the network, updates
 *   the React Query cache with fresh data, and writes the new payload
 *   to localStorage so the next reload starts from an even fresher
 *   seed. Idempotent — guarded so we don't double-fetch on hot reload.
 *
 * The `setQueryData` write here is observable by every
 * `useSubscriptionQuery()` call site without any of them needing
 * special prop drilling — that's the whole point of React Query's
 * shared cache.
 */
import { getSubscription } from '../../api/billing'
import { getAccessTokenOrNull } from './authToken'
import { queryKeys } from './queryKeys'
import {
  cacheSubscription,
  loadCachedSubscription,
} from './subscriptionCache'

let _prefetchedThisSession = false

/**
 * Sync — runs at App mount time before the first React render is
 * committed. Pulls the last-known subscription from localStorage and
 * seeds React Query's cache with it. No network. Safe to call on every
 * mount; if there's no cached value, it's a no-op.
 */
export function seedSubscriptionFromCache(queryClient) {
  if (!queryClient) return null
  const cached = loadCachedSubscription()
  if (!cached) return null
  // Only seed if React Query doesn't already have data — avoids
  // overwriting a fresh value that just landed (e.g. on hot reload).
  const existing = queryClient.getQueryData(queryKeys.billing.subscription)
  if (existing !== undefined) return existing
  queryClient.setQueryData(queryKeys.billing.subscription, cached)
  return cached
}

/**
 * Async — fetch the subscription from the server, update React Query's
 * cache, and persist to localStorage for the next reload. Resolves
 * silently on auth failure so callers don't need to handle errors;
 * the next `useSubscriptionQuery` mount will retry naturally.
 */
export async function prefetchSubscription(queryClient) {
  if (!queryClient || _prefetchedThisSession) return
  const token = await getAccessTokenOrNull()
  if (!token) return
  _prefetchedThisSession = true
  try {
    const sub = await queryClient.fetchQuery({
      queryKey: queryKeys.billing.subscription,
      queryFn: () => getSubscription(token),
    })
    cacheSubscription(sub)
  } catch {
    // Quietly swallow — the regular `useSubscriptionQuery` polling
    // will pick up where we left off and surface real errors at the
    // component level if needed.
  }
}

/**
 * Reset the prefetch guard so the next `prefetchSubscription` call
 * actually fires. Wired into `sessionReset.js` so a logout → login on
 * the same tab re-fetches for the new user.
 */
export function resetSubscriptionPrefetchFlag() {
  _prefetchedThisSession = false
}
