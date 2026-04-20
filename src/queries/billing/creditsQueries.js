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

import { getCredits, getFeatureCosts, getSubscription } from '../../api/billing'
import { useModelTierStateQuery } from '../modelTier/modelTierQueries'
import { getAccessTokenOrNull } from '../../lib/query/authToken'
import { queryFreshness } from '../../lib/query/queryConfig'
import { queryKeys } from '../../lib/query/queryKeys'
import { resultOrNullOnAuthFailure } from '../../lib/query/safeApi'

export function useCreditsQuery(options = {}) {
  return useQuery({
    queryKey: queryKeys.billing.credits,
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) return null
      return resultOrNullOnAuthFailure(getCredits(token))
    },
    staleTime: queryFreshness.short,
    gcTime: queryFreshness.long,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
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
  return useQuery({
    queryKey: queryKeys.billing.subscription,
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) return null
      return resultOrNullOnAuthFailure(getSubscription(token))
    },
    staleTime: queryFreshness.medium,
    gcTime: queryFreshness.long,
  })
}

/**
 * Call from any AI mutation's onSuccess/onError so the credits badge reflects
 * the server-side debit (or refund) immediately.
 */
export function invalidateCredits(queryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.billing.credits })
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
