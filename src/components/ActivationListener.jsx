import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { celebrate } from '../lib/celebrate'
import { useSubscriptionActivationStore } from '../stores/subscriptionActivationStore'
import { refreshBillingState, useSubscriptionQuery } from '../queries/billing/creditsQueries'

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

// Permission-gating set — `past_due` still has Pro access (Paddle is
// retrying the charge; we don't lock the user out mid-dunning). Used
// for the "did we drop OUT of an active state" reset branch.
const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due'])
// Celebration set — stricter on purpose. `past_due` means the renewal
// payment FAILED and is being retried; surfacing a "You're Pro!" confetti
// burst at that moment is wrong (the customer's card just declined).
// Only a clean `active` / `trialing` transition is worth celebrating.
const CELEBRATE_STATUSES = new Set(['active', 'trialing'])
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

  // Mount-time guard against the first-login false celebration. On a
  // fresh tab `prevStatusRef` starts null and `CELEBRATED_KEY` is empty;
  // when the very first network fetch returns `active` for a user who
  // was ALREADY Pro before this session, the null→active path would
  // otherwise fire a "You're Pro!" confetti burst they didn't earn now.
  // If the user is already in a celebratable state on the first render
  // we've observed, seed the session dedupe key so only a genuine
  // mid-session inactive→active transition celebrates. Runs once.
  const seededRef = useRef(false)
  useEffect(() => {
    if (seededRef.current) return
    const status = subscription?.status
    if (!status) return // wait for the first real status before deciding
    seededRef.current = true
    if (CELEBRATE_STATUSES.has(status) && !readCelebratedSubId()) {
      const subId =
        subscription?.subscription_id || subscription?.plan_slug || subscription?.tier || 'pro'
      writeCelebratedSubId(subId)
    }
  }, [subscription])

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

    // Celebration uses the STRICT set — a flip into `past_due` is a
    // failed renewal, not a moment to celebrate. `wasInactive` is the
    // negation of the strict set too, so `active → past_due → active`
    // (dunning recovery) can still re-celebrate once resolved.
    const wasInactive = !CELEBRATE_STATUSES.has(prev)
    const isActiveNow = status && CELEBRATE_STATUSES.has(status)

    if (wasInactive && isActiveNow) {
      // Dedupe across in-session refreshes by tagging with the subscription
      // id (or plan_slug as a softer key when id missing).
      const subId =
        subscription?.subscription_id || subscription?.plan_slug || subscription?.tier || 'pro'
      const alreadyCelebrated = readCelebratedSubId() === String(subId)

      if (!alreadyCelebrated) {
        const planName = subscription?.plan_name || subscription?.tier || 'Pro'
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
      // Dropped out of a celebratable state — covers a real cancel
      // (active → canceled) AND a failed renewal (active → past_due).
      // Either way, clear the dedupe key so a later clean reactivation
      // (e.g. dunning recovery past_due → active) celebrates again.
      // `ACTIVE_STATUSES` (not the strict set) on `prev` so we don't
      // wipe the key on an active→active no-op.
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
