/**
 * SubscriptionActivationSplash — full-viewport overlay shown after the user
 * completes Paddle checkout, while we wait for either:
 *   (a) the `subscription.created` webhook to land + our DB to flip to
 *       active/trialing, OR
 *   (b) the 60s `subscriptionActivationStore` timeout backstop to fire.
 *
 * Drives off the same store as `<ActivationListener>` and `<PaymentProcessingBanner>`:
 *   - `isPending` true → render "Activating your subscription…"
 *   - subscription flips to active/trialing while we were pending →
 *     render the welcome state for ~2 s, then unmount
 *   - `timeoutFired` true and still no active sub → render the
 *     "payment is taking longer than usual" state with refresh / support
 *     actions and an explicit dismiss
 *
 * Why a full overlay and not a strip: the immediate post-checkout moment is
 * the highest-anxiety point in the funnel. The user just gave us money and
 * needs unambiguous feedback that we received it. A thin banner under the
 * fold (the previous `ActivatingProStrip`) didn't deliver that.
 */
import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, RefreshCw, Mail, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion' // eslint-disable-line no-unused-vars

import { useSubscriptionActivationStore } from '../stores/subscriptionActivationStore'
import { useSubscriptionQuery } from '../queries/billing/creditsQueries'
import './SubscriptionActivationSplash.css'

const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due'])
const SUCCESS_HOLD_MS = 2200

function capitalize(s) {
  if (!s || typeof s !== 'string') return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function SubscriptionActivationSplash() {
  const isPending = useSubscriptionActivationStore((s) => s.isPending)
  const timeoutFired = useSubscriptionActivationStore((s) => s.timeoutFired)
  const stopActivation = useSubscriptionActivationStore((s) => s.stop)
  const { data: subscription } = useSubscriptionQuery()

  const hasActiveSub = !!(subscription?.status && ACTIVE_STATUSES.has(subscription.status))

  // 'hidden' | 'activating' | 'success' | 'timeout'
  const [phase, setPhase] = useState('hidden')
  const wasActivatingRef = useRef(false)
  const successTimerRef = useRef(null)

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current)
    }
  }, [])

  useEffect(() => {
    // Active burst: show the activating UI. Capture that we ever entered
    // this state so the next inactive→active transition can trigger the
    // success ribbon (instead of unmounting silently).
    if (isPending) {
      wasActivatingRef.current = true
      setPhase((prev) => (prev === 'success' ? prev : 'activating'))
      return
    }

    // Burst ended (stop() was called by ActivationListener) AND we have
    // an active sub — celebrate inside the splash before unmounting.
    if (wasActivatingRef.current && hasActiveSub && phase !== 'success') {
      setPhase('success')
      if (successTimerRef.current) clearTimeout(successTimerRef.current)
      successTimerRef.current = setTimeout(() => {
        setPhase('hidden')
        wasActivatingRef.current = false
      }, SUCCESS_HOLD_MS)
      return
    }

    // 60s backstop fired without an active sub — show the actionable
    // delayed-payment state. The user can refresh, contact support, or
    // dismiss.
    if (timeoutFired && !hasActiveSub) {
      setPhase('timeout')
      return
    }

    // Nothing in flight, nothing to celebrate, nothing to warn about.
    if (phase !== 'success') {
      setPhase('hidden')
    }
  }, [isPending, hasActiveSub, timeoutFired, phase])

  if (phase === 'hidden') return null

  const planLabel = capitalize(subscription?.plan_name || subscription?.tier || 'Pro')

  return (
    <AnimatePresence>
      <motion.div
        className="sub-splash-backdrop"
        role="dialog"
        aria-modal="true"
        aria-live="polite"
        aria-label="Subscription activation"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <motion.div
          className="sub-splash-card"
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
        >
          {phase === 'activating' && (
            <>
              <div className="sub-splash-spinner" aria-hidden="true" />
              <h2 className="sub-splash-title">Activating your subscription…</h2>
              <p className="sub-splash-sub">
                Paddle confirmed your payment. Pulling the rest from our side now — this usually
                takes a couple of seconds.
              </p>
              <ul className="sub-splash-steps" aria-hidden="true">
                <li className="sub-splash-step sub-splash-step--done">Payment received</li>
                <li className="sub-splash-step sub-splash-step--active">Provisioning credits</li>
                <li className="sub-splash-step">Unlocking features</li>
              </ul>
            </>
          )}

          {phase === 'success' && (
            <>
              <motion.div
                className="sub-splash-check"
                initial={{ scale: 0.5, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 240, damping: 16 }}
                aria-hidden="true"
              >
                <CheckCircle2 size={64} strokeWidth={1.6} />
              </motion.div>
              <h2 className="sub-splash-title">You&apos;re on {planLabel}!</h2>
              <p className="sub-splash-sub">
                Credits and premium features are unlocked. Redirecting you in a moment…
              </p>
            </>
          )}

          {phase === 'timeout' && (
            <>
              <button
                type="button"
                className="sub-splash-close"
                onClick={() => {
                  stopActivation()
                  setPhase('hidden')
                  wasActivatingRef.current = false
                }}
                aria-label="Dismiss"
              >
                <X size={18} strokeWidth={2} />
              </button>
              <div className="sub-splash-warn" aria-hidden="true">
                !
              </div>
              <h2 className="sub-splash-title">Still confirming with Paddle…</h2>
              <p className="sub-splash-sub">
                Your payment may still be processing on Paddle&apos;s side, or it didn&apos;t
                complete. If you don&apos;t see your plan within a minute, try again — you
                won&apos;t be double-charged.
              </p>
              <div className="sub-splash-actions">
                <button
                  type="button"
                  className="sub-splash-btn sub-splash-btn--primary"
                  onClick={() => window.location.reload()}
                >
                  <RefreshCw size={14} strokeWidth={2} />
                  Refresh page
                </button>
                <a
                  className="sub-splash-btn sub-splash-btn--ghost"
                  href="mailto:support@clixa.app?subject=Subscription%20activation%20issue"
                >
                  <Mail size={14} strokeWidth={2} />
                  Contact support
                </a>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default SubscriptionActivationSplash
