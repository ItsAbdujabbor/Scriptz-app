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
import { useCreditsQuery, useSubscriptionQuery } from '../queries/billing/creditsQueries'
import './SubscriptionActivationSplash.css'

const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due'])
const SUCCESS_HOLD_MS = 2200

function capitalize(s) {
  if (!s || typeof s !== 'string') return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function fmtCredits(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  if (v >= 1000) {
    const k = v / 1000
    return k % 1 === 0 ? `${k}K` : `${k.toFixed(1)}K`
  }
  return v.toLocaleString('en-US')
}

export function SubscriptionActivationSplash() {
  const isPending = useSubscriptionActivationStore((s) => s.isPending)
  const timeoutFired = useSubscriptionActivationStore((s) => s.timeoutFired)
  const kind = useSubscriptionActivationStore((s) => s.kind)
  const pack = useSubscriptionActivationStore((s) => s.pack)
  const packBaseline = useSubscriptionActivationStore((s) => s.packBaseline)
  const stopActivation = useSubscriptionActivationStore((s) => s.stop)
  const resetActivation = useSubscriptionActivationStore((s) => s.reset)
  const { data: subscription } = useSubscriptionQuery()
  const { data: credits } = useCreditsQuery()

  const hasActiveSub = !!(subscription?.status && ACTIVE_STATUSES.has(subscription.status))
  const isPack = kind === 'pack'
  // Pack success = permanent_credits balance now exceeds the snapshot
  // taken at start(). Any positive delta is enough — we know a purchase
  // is in flight (isPending was true) and the user can only have one
  // pack purchase open at a time.
  const packBalanceIncreased = !!(
    isPack &&
    credits &&
    Number(credits.permanent_credits || 0) > Number(packBaseline || 0)
  )

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
      // For pack mode: if the credits balance has ALREADY landed past
      // the baseline (webhook arrived faster than the splash could
      // render the activating UI), skip straight to success.
      if (isPack && packBalanceIncreased && phase !== 'success') {
        setPhase('success')
        if (successTimerRef.current) clearTimeout(successTimerRef.current)
        successTimerRef.current = setTimeout(() => {
          setPhase('hidden')
          wasActivatingRef.current = false
          stopActivation()
          resetActivation()
        }, SUCCESS_HOLD_MS)
        return
      }
      setPhase((prev) => (prev === 'success' ? prev : 'activating'))
      return
    }

    // Burst ended AND we have evidence of success — show the success
    // ribbon before unmounting. Two paths:
    //   * subscription: ActivationListener calls stop() on the
    //     inactive→active transition.
    //   * pack: credit balance increased past the baseline. We call
    //     stopActivation() ourselves once we detect it.
    const subSucceeded = !isPack && wasActivatingRef.current && hasActiveSub
    const packSucceeded = isPack && wasActivatingRef.current && packBalanceIncreased

    if ((subSucceeded || packSucceeded) && phase !== 'success') {
      setPhase('success')
      if (successTimerRef.current) clearTimeout(successTimerRef.current)
      successTimerRef.current = setTimeout(() => {
        setPhase('hidden')
        wasActivatingRef.current = false
        // For pack mode, ActivationListener doesn't call stop() for us
        // (it only watches subscription transitions). Reset here so the
        // store is fully clean for the next purchase.
        if (isPack) {
          stopActivation()
        }
        resetActivation()
      }, SUCCESS_HOLD_MS)
      return
    }

    // 60s backstop fired without a successful activation — show the
    // actionable delayed-payment state. The user can refresh, contact
    // support, or dismiss.
    if (timeoutFired && !subSucceeded && !packSucceeded) {
      setPhase('timeout')
      return
    }

    // Nothing in flight, nothing to celebrate, nothing to warn about.
    if (phase !== 'success') {
      setPhase('hidden')
    }
  }, [
    isPending,
    isPack,
    hasActiveSub,
    packBalanceIncreased,
    timeoutFired,
    phase,
    stopActivation,
    resetActivation,
  ])

  if (phase === 'hidden') return null

  const planLabel = capitalize(subscription?.plan_name || subscription?.tier || 'Pro')

  const handleDismiss = () => {
    stopActivation()
    setPhase('hidden')
    wasActivatingRef.current = false
  }

  return (
    <AnimatePresence>
      <motion.div
        className="sub-splash-backdrop"
        role="status"
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
            <button
              type="button"
              className="sub-splash-close"
              onClick={handleDismiss}
              aria-label="Dismiss"
            >
              <X size={18} strokeWidth={2} />
            </button>
          )}

          {phase === 'activating' && isPack && (
            <>
              <div className="sub-splash-spinner" aria-hidden="true" />
              <h2 className="sub-splash-title">Adding your credits…</h2>
              <p className="sub-splash-sub">
                Paddle confirmed your payment. Crediting{' '}
                {pack?.credits ? (
                  <strong>{fmtCredits(pack.credits)} credits</strong>
                ) : (
                  'your purchase'
                )}{' '}
                to your balance now — usually under a couple of seconds.
              </p>
              <ul className="sub-splash-steps" aria-hidden="true">
                <li className="sub-splash-step sub-splash-step--done">Payment received</li>
                <li className="sub-splash-step sub-splash-step--active">Adding credits</li>
                <li className="sub-splash-step">Updating balance</li>
              </ul>
            </>
          )}

          {phase === 'activating' && !isPack && (
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

          {phase === 'success' && isPack && (
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
              <h2 className="sub-splash-title">
                +{pack?.credits ? fmtCredits(pack.credits) : ''} credits added!
              </h2>
              <p className="sub-splash-sub">
                Permanent credits — they never expire. Your new balance is live in the sidebar.
              </p>
            </>
          )}

          {phase === 'success' && !isPack && (
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
                onClick={handleDismiss}
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
                complete.{' '}
                {isPack
                  ? 'If your credits don’t appear within a minute, try again — you won’t be double-charged.'
                  : 'If you don’t see your plan within a minute, try again — you won’t be double-charged.'}
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
