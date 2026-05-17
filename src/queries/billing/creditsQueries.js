/**
 * Billing queries — credit balance + per-feature cost map + subscription.
 *
 * Design:
 *   - `useCreditsQuery()` polls the balance every 30s while the tab is active
 *     and auto-refetches after any AI mutation (via `invalidateCredits()`).
 *   - `useFeatureCostsQuery()` is public and rarely changes — long stale time.
 *   - `invalidateCredits(queryClient)` is the single helper AI mutations call
 *     in their `onSuccess` / `onError` handlers to refresh the sidebar badge.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { getCredits, getFeatureCosts, getPaymentMethod, getSubscription } from '../../api/billing'
import { useModelTierStateQuery } from '../modelTier/modelTierQueries'
import { getAccessTokenOrNull } from '../../lib/query/authToken'
import { queryFreshness } from '../../lib/query/queryConfig'
import { queryKeys } from '../../lib/query/queryKeys'
import { resultOrNullOnAuthFailure } from '../../lib/query/safeApi'
import { cacheSubscription } from '../../lib/query/subscriptionCache'
import { useSubscriptionActivationStore } from '../../stores/subscriptionActivationStore'

export function useCreditsQuery(options = {}) {
  // Same burst pattern as useSubscriptionQuery: when a credit-pack
  // purchase is in flight, poll every 1s instead of the 30s baseline
  // so the splash detects the post-webhook balance increase fast
  // enough to flip to the "+200 credits added!" success ribbon.
  const isActivating = useSubscriptionActivationStore((s) => s.isPending)
  return useQuery({
    queryKey: queryKeys.billing.credits,
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) return null
      return resultOrNullOnAuthFailure(getCredits(token))
    },
    staleTime: queryFreshness.short,
    gcTime: queryFreshness.long,
    // STM-04: during the activation burst the 1s `refetchInterval`
    // already drives fast polling; leaving `refetchOnWindowFocus` on
    // means a tab-focus event fires a SECOND concurrent fetch right
    // next to an interval tick (double request, double webhook-race
    // churn). Disable focus-refetch in burst mode — the interval has
    // it covered. Outside burst, focus-refetch stays on for freshness.
    refetchOnWindowFocus: !isActivating,
    refetchInterval: isActivating ? 1_000 : 30_000,
    // Pause polling while the tab is hidden to avoid pointless
    // background traffic — EXCEPT during the activation burst, where
    // the user may have switched tabs (e.g. to complete Paddle
    // checkout in another tab) and we still need to detect the
    // post-webhook balance change to flip the success ribbon.
    refetchIntervalInBackground: isActivating,
    ...options,
  })
}

export function useFeatureCostsQuery() {
  return useQuery({
    queryKey: queryKeys.billing.featureCosts,
    queryFn: () => getFeatureCosts(),
    staleTime: queryFreshness.long,
    gcTime: queryFreshness.weekly,
  })
}

export function useSubscriptionQuery() {
  // Subscription state gates Pro features and must stay closely aligned with
  // the credit balance (a grant/revoke moves both together). Two polling
  // modes:
  //   * baseline (15s) — admin-side plan changes land within ~15s without a
  //     page reload, dropping to ~focus latency when the tab is foregrounded.
  //   * burst (1s) — kicked on by `subscriptionActivationStore.start()`
  //     after a checkout completes. Combined with the optimistic
  //     setQueryData in CheckoutScreen + the immediate /sync call in
  //     the activation store, the UI flips to Pro within ~1 s of Paddle
  //     saying "paid" — no visible wait for the webhook.
  // The server caches this response per-user (2-min TTL) and the
  // grant/revoke/webhook paths bust that cache, so polling here is cheap.
  const isActivating = useSubscriptionActivationStore((s) => s.isPending)
  return useQuery({
    queryKey: queryKeys.billing.subscription,
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) return null
      const result = await resultOrNullOnAuthFailure(getSubscription(token))
      // Persist every successful fetch to localStorage so the next
      // page reload skips the "Free → Pro" flash. Mid-session
      // upgrades (e.g. user just activated) flow through here too,
      // keeping the cache aligned with the live state.
      if (result) cacheSubscription(result)
      return result
    },
    staleTime: queryFreshness.short,
    gcTime: queryFreshness.long,
    // STM-04: same rationale as useCreditsQuery — disable focus-refetch
    // during the burst so a tab focus doesn't double-fire alongside the
    // 1s interval; keep background polling alive during the burst so a
    // checkout completed in another tab is still detected.
    refetchOnWindowFocus: !isActivating,
    refetchInterval: isActivating ? 1_000 : 15_000,
    refetchIntervalInBackground: isActivating,
  })
}

export function usePaymentMethodQuery(enabled = false) {
  return useQuery({
    queryKey: queryKeys.billing.paymentMethod,
    enabled,
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) return null
      return resultOrNullOnAuthFailure(getPaymentMethod(token))
    },
    staleTime: 60_000,
    gcTime: queryFreshness.long,
    retry: 1,
  })
}

/**
 * Warm the credits balance into the React Query cache before
 * `HeaderCreditsBadge` (and any other consumer) mounts. Without this the
 * badge first fires its fetch only after the lazy `AuthenticatedRoutes`
 * chunk loads and the component renders — adding a visible wait on the
 * credits number after sign-in. Fire-and-forget; failures are swallowed
 * so the regular `useCreditsQuery` mount can retry.
 */
let _creditsPrefetchedThisSession = false
export async function prefetchCredits(queryClient) {
  if (!queryClient || _creditsPrefetchedThisSession) return
  const token = await getAccessTokenOrNull()
  if (!token) return
  _creditsPrefetchedThisSession = true
  try {
    await queryClient.fetchQuery({
      queryKey: queryKeys.billing.credits,
      queryFn: () => resultOrNullOnAuthFailure(getCredits(token)),
    })
  } catch {
    /* surface via the regular query on mount */
  }
}

export function resetCreditsPrefetchFlag() {
  _creditsPrefetchedThisSession = false
}

/**
 * Call from any AI mutation's onSuccess/onError so the credits badge reflects
 * the server-side debit (or refund) immediately.
 */
export function invalidateCredits(queryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.billing.credits })
}

/**
 * Atomic billing-state refresh. Invalidates EVERY billing-related query
 * in one call so when a payment / cancellation / plan-change / skip-trial
 * lands, every UI surface (sidebar tier, credits badge, paywall callouts,
 * billing panel, recent invoices) refetches together — no surface left
 * showing stale state.
 *
 * Use this from:
 *   * Paddle.js `checkout.completed` event handler
 *   * Skip-trial mutation onSuccess
 *   * Cancel-subscription mutation onSuccess
 *   * Change-plan mutation onSuccess
 *   * `<ActivationListener>` when status flips inactive → active
 *   * Webhook-driven sync endpoint completion
 *
 * Strictly an `invalidateQueries` fan-out — does NOT touch React Query's
 * cached values directly. The localStorage subscription cache is updated
 * by the regular query refetches that follow (see `creditsQueries.js`
 * line ~70 for the persist-on-fetch hook).
 */
export function refreshBillingState(queryClient) {
  if (!queryClient) return
  queryClient.invalidateQueries({ queryKey: queryKeys.billing.subscription })
  queryClient.invalidateQueries({ queryKey: queryKeys.billing.credits })
  queryClient.invalidateQueries({ queryKey: queryKeys.billing.ledger })
  // Payment-method / billing-address also moves on plan changes, card
  // updates, and cancellations. Without this the BillingSettingsPanel's
  // card-on-file + billing-address tiles stay stale after a payment
  // event while every sibling surface refreshed (1-min staleTime on
  // `usePaymentMethodQuery` otherwise hides the change for up to a min).
  queryClient.invalidateQueries({ queryKey: queryKeys.billing.paymentMethod })
}

/**
 * Hook alias for components that only need the invalidation callback.
 * Example:
 *   const invalidate = useInvalidateCredits()
 *   useMutation({ onSuccess: invalidate, onError: invalidate })
 */
export function useInvalidateCredits() {
  const queryClient = useQueryClient()
  return () => invalidateCredits(queryClient)
}

/**
 * Convenience: `costOf("thumbnail_generate", 4)` → `{unit, total}` for the
 * caller's currently-selected SRX tier.
 *
 * `/api/billing/feature-costs` returns `{feature: {SRX-2:N, SRX-3:M}}` so we
 * pick the entry that matches `useModelTierStateQuery().selected`, falling
 * back to Pro (SRX-2) if the tier is missing. Legacy flat number values and
 * legacy SRX-1 keys are still accepted (collapsed onto SRX-2).
 */
export function useCostOf(featureKey, count = 1) {
  const { data } = useFeatureCostsQuery()
  const { data: tierState } = useModelTierStateQuery()
  const tier = tierState?.selected || 'SRX-2'
  const entry = data?.[featureKey]
  let unit = 0
  if (typeof entry === 'number') {
    unit = entry
  } else if (entry && typeof entry === 'object') {
    unit = entry[tier] ?? entry['SRX-2'] ?? entry['SRX-3'] ?? 0
  }
  return { unit, total: unit * Math.max(1, Number(count) || 1), tier }
}
