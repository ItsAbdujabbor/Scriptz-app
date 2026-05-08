import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { celebrate } from '../lib/celebrate'
import { useSubscriptionActivationStore } from '../stores/subscriptionActivationStore'
import {
  refreshBillingState,
  useSubscriptionQuery,
} from '../queries/billing/creditsQueries'

/**
 * Singleton — mounted once at the app shell. Its job:
 *
 *   1. Listen for `app:checkout-completed` (dispatched after Paddle confirms
 *      a purchase) and flip `subscriptionActivationStore` into burst mode so
 *      the subscription query polls every 2s.
 *   2. Watch the live subscription state. When it transitions from inactive
 *      → active (any source: Paddle webhook landing, admin grant), fire a
 *      celebration once and turn burst mode off. Also force-invalidate the
 *      credits query so the badge reflects the freshly-granted bucket in
 *      the same render.
 *
 * The transition celebration is deduped per-session via sessionStorage —
 * refreshing the page while already Pro must NOT re-trigger it.
 */

const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due'])
const CELEBRATED_KEY = 'clixa_pro_activation_celebrated'

function readCelebratedSubId() {
  try {
    return sessionStorage.getItem(CELEBRATED_KEY) || null
  } catch {
    return null
  }
}

function writeCelebratedSubId(subId) {
  try {
    if (subId) sessionStorage.setItem(CELEBRATED_KEY, String(subId))
    else sessionStorage.removeItem(CELEBRATED_KEY)
  } catch {}
}

export default function ActivationListener() {
  const { data: subscription } = useSubscriptionQuery()
  const queryClient = useQueryClient()
  const start = useSubscriptionActivationStore((s) => s.start)
  const stop = useSubscriptionActivationStore((s) => s.stop)
  const prevStatusRef = useRef(null)

  // Bridge the global "checkout completed" event into the burst-mode store.
  // Multiple call sites can dispatch (Paddle iframe handler, deep-link
  // landing on ?checkout=success) — they all converge here.
  useEffect(() => {
    const onCheckoutCompleted = () => start()
    window.addEventListener('app:checkout-completed', onCheckoutCompleted)
    return () => {
      window.removeEventListener('app:checkout-completed', onCheckoutCompleted)
    }
  }, [start])

  // Watch the subscription for inactive → active transitions.
  useEffect(() => {
    const status = subscription?.status || null
    const prev = prevStatusRef.current

    // Don't react until we've seen a non-null status at least once. The
    // first render typically arrives with stale-fresh cached data, so we
    // seed the ref and bail.
    if (prev === null) {
      prevStatusRef.current = status
      return
    }

    const wasInactive = !ACTIVE_STATUSES.has(prev)
    const isActiveNow = status && ACTIVE_STATUSES.has(status)

    if (wasInactive && isActiveNow) {
      // Dedupe across in-session refreshes by tagging with the subscription
      // id (or plan_slug as a softer key when id missing).
      const subId =
        subscription?.subscription_id ||
        subscription?.plan_slug ||
        subscription?.tier ||
        'pro'
      const alreadyCelebrated = readCelebratedSubId() === String(subId)

      if (!alreadyCelebrated) {
        const planName =
          subscription?.plan_name ||
          subscription?.tier ||
          'Pro'
        celebrate({
          emoji: '✨',
          title: "You're Pro!",
          subtitle: `${capitalize(planName)} is unlocked. Credits are landing now.`,
          variant: 'thanks',
          duration: 5200,
        })
        writeCelebratedSubId(subId)
      }

      // Burst mode did its job — stop polling fast and refresh every
      // billing surface so credits, subscription, AND the recent-invoices
      // ledger reflect the freshly-activated state in one render cycle.
      stop()
      refreshBillingState(queryClient)
    } else if (!isActiveNow && prev !== null && ACTIVE_STATUSES.has(prev)) {
      // Subscription dropped out of active — clear the dedupe key so the
      // next reactivation gets to celebrate again.
      writeCelebratedSubId(null)
    }

    prevStatusRef.current = status
  }, [subscription, queryClient, stop])

  return null
}

function capitalize(s) {
  if (!s || typeof s !== 'string') return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}
