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
import { useSubscriptionActivationStore } from '../stores/subscriptionActivationStore'
import './PaymentProcessingBanner.css'

export function PaymentProcessingBanner() {
  const timeoutFired = useSubscriptionActivationStore((s) => s.timeoutFired)
  if (!timeoutFired) return null

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
    </div>
  )
}
