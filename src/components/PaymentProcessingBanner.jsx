/**
 * PaymentProcessingBanner — slim warning bar shown when a Paddle webhook
 * has failed to land within the 60-s activation burst window AND the
 * `/api/billing/sync` backstop also couldn't rescue the state.
 *
 * Behaviour:
 *   - Hidden by default.
 *   - Renders when `subscriptionActivationStore.timeoutFired === true`
 *     (set by the store when the burst-mode timeout fires without an
 *     active subscription appearing — see `subscriptionActivationStore.js`).
 *   - Auto-dismisses the moment the subscription flips into an active
 *     state (handled by `<ActivationListener>` calling `stop()`, which
 *     resets `timeoutFired` to false).
 *   - User-dismissable via the × button (clears the store's terminal
 *     state so the bar doesn't reappear on the next render).
 *   - Self-dismisses after a 10-minute TTL — if it's been up that long
 *     with no resolution, the webhook is almost certainly never coming
 *     and an indefinitely-pinned bar just becomes UI noise; the user
 *     already has the support escalation path by then.
 *
 * Design intent:
 *   Fail loud, not silent. When a customer paid but the webhook is
 *   delayed for any reason, the previous behaviour was to silently
 *   revert from 2-s burst polling to 15-s baseline polling — leaving
 *   the user staring at a "Free" sidebar while their card was charged.
 *   This banner gives them a clear acknowledgment that we know the
 *   payment is in flight, plus a support email to escalate if it
 *   doesn't resolve in a few minutes.
 */
import { useEffect } from 'react'

import { useSubscriptionActivationStore } from '../stores/subscriptionActivationStore'
import './PaymentProcessingBanner.css'

const AUTO_DISMISS_MS = 10 * 60 * 1000 // 10 minutes

export function PaymentProcessingBanner() {
  const timeoutFired = useSubscriptionActivationStore((s) => s.timeoutFired)
  const reset = useSubscriptionActivationStore((s) => s.reset)

  // Dismissal — whether by the × button, the TTL, or a real activation
  // — flows through the store's `timeoutFired` flag, NOT a local
  // `dismissed` state. The store is the single source of truth: when it
  // flips false the component returns null and naturally unmounts. This
  // also means a subsequent burst that times out again (user retried
  // checkout) re-shows the banner for free, with no local re-arm logic.
  //
  // 10-minute TTL backstop: if the webhook never lands and the user
  // never dismisses, an indefinitely-pinned bar is just noise — they
  // already have the support escalation path by then. Only armed while
  // the banner is actually showing; the cleanup clears the timer if the
  // activation resolves (or the user dismisses) first.
  useEffect(() => {
    if (!timeoutFired) return
    const timer = setTimeout(() => reset(), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [timeoutFired, reset])

  if (!timeoutFired) return null

  // reset() clears timeoutFired (→ component returns null next render),
  // aborts any straggling /sync, and wipes the burst metadata — the
  // correct end-state once the user has acknowledged the delay.
  const handleDismiss = () => reset()

  return (
    <div className="payment-processing-banner" role="status" aria-live="polite">
      <span className="payment-processing-banner__dot" aria-hidden="true" />
      <span className="payment-processing-banner__text">
        We&apos;re still processing your payment. Refresh in a moment, or{' '}
        <a
          href="mailto:support@clixa.app?subject=Payment%20processing%20delay"
          className="payment-processing-banner__link"
        >
          email support@clixa.app
        </a>{' '}
        if Pro features don&apos;t unlock soon.
      </span>
      <button
        type="button"
        className="payment-processing-banner__dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss payment processing notice"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
