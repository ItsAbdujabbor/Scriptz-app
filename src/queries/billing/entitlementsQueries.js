/**
 * Entitlements — derived from the subscription response.
 *
 * `usePlanEntitlements()` returns:
 *   {
 *     tier: "free" | "starter" | "creator" | "ultimate",
 *     isSubscribed: boolean,   // true for active / trialing / past_due
 *     isTrial: boolean,
 *     features: { personas, styles, faceswap, priority_support, advanced_analytics, ... },
 *     canUse: (key) => boolean,
 *   }
 *
 * The server is the source of truth — these values mirror `features_json`
 * returned by `/api/billing/subscription`. If the frontend check is bypassed,
 * the backend `require_plan_feature` dependency still returns 403.
 */
import { useMemo } from 'react'

import { useSubscriptionQuery } from './creditsQueries'

const ACTIVE = new Set(['active', 'trialing', 'past_due'])
const FREE_FEATURES = {
  tier: 'free',
  personas: false,
  styles: false,
  faceswap: false,
  priority_support: false,
  advanced_analytics: false,
}

export function usePlanEntitlements() {
  const { data: subscription, isLoading } = useSubscriptionQuery()

  return useMemo(() => {
    const isSubscribed = !!subscription && ACTIVE.has(subscription.status)
    const features =
      isSubscribed && subscription.features
        ? { ...FREE_FEATURES, ...subscription.features }
        : { ...FREE_FEATURES }
    const tier = subscription?.tier || features.tier || 'free'
    const isTrial = !!subscription?.is_trial
    const canUse = (key) => !!features[key]
    return { tier, isSubscribed, isTrial, features, canUse, isLoading }
  }, [subscription, isLoading])
}
