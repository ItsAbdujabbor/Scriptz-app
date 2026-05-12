/**
 * CheckoutScreen — production-grade subscription checkout.
 *
 * Surface composition:
 *   - Sticky top bar:  back arrow · brand · "Secure checkout" trust pill.
 *   - Left column:     order summary card (plan, line items, totals, renewal note,
 *                      money-back guarantee).
 *   - Right column:    payment-details card hosting the Paddle Inline iframe,
 *                      with a skeleton overlay while the iframe paints, and a
 *                      success/retry state managed via Framer Motion.
 *
 * Why the iframe is Paddle (and not styled like Stripe's): the card-entry
 * fields are PCI-bound — the payment processor must render them in its own
 * iframe. We control everything *around* the iframe; the iframe contents
 * remain Paddle's design.
 *
 * Performance: Paddle.js is preloaded from the pricing page (`preloadPaddle()`
 * in ProPricingContent), and `index.html` carries `<link rel="preconnect">`
 * hints to `cdn.paddle.com` and `*-buy.paddle.com`, so by the time the user
 * lands here the script is in cache and the iframe paints in <1s on a warm
 * connection.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion' // eslint-disable-line no-unused-vars
import { ArrowLeft, Lock, ShieldCheck, RotateCw, CheckCircle2, Sparkles, Info } from 'lucide-react'
import { openPaddleInlineCheckout } from '../lib/paddle'
import { refreshBillingState } from '../queries/billing/creditsQueries'
import { queryKeys } from '../lib/query/queryKeys'
import { friendlyMessage } from '../lib/aiErrors'
import { useSubscriptionActivationStore } from '../stores/subscriptionActivationStore'
import './CheckoutScreen.css'

const SESSION_KEY = 'clixa_checkout_session'
const FRAME_TARGET_CLASS = 'paddle-inline-frame'
const LOAD_TIMEOUT_MS = 20_000

function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.transactionId) return null
    return parsed
  } catch {
    return null
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    /* sessionStorage unavailable */
  }
}

export function CheckoutScreen({ onClose }) {
  const queryClient = useQueryClient()
  const session = useMemo(() => readSession(), [])

  const [status, setStatus] = useState('idle')
  // 'idle' | 'mounting' | 'ready' | 'completed' | 'error'
  const [error, setError] = useState(null)
  const [retryNonce, setRetryNonce] = useState(0)

  // No session → bounce to pricing.
  useEffect(() => {
    if (session) return
    window.location.hash = 'pro'
  }, [session])

  // Mount Paddle. StrictMode-safe: every effect run gets its own
  // `cancelled` closure, the cleanup only marks it true (doesn't tear
  // down Paddle), and `paddle.js` calls `Checkout.close()` before each
  // `open()` so the second mount in dev gets a fresh iframe in the live
  // DOM target rather than inheriting the orphaned first one.
  useEffect(() => {
    if (!session) return

    let cancelled = false
    setStatus('mounting')
    setError(null)

    const readyFallback = window.setTimeout(() => {
      if (cancelled) return
      setStatus('ready')
    }, 800)

    const loadTimeout = window.setTimeout(() => {
      if (cancelled) return
      setStatus((prev) => (prev === 'ready' || prev === 'completed' ? prev : 'error'))
      setError('Checkout took too long to load. Check your connection and try again.')
    }, LOAD_TIMEOUT_MS)

    openPaddleInlineCheckout({
      transactionId: session.transactionId,
      clientToken: session.clientToken,
      frameTargetClass: FRAME_TARGET_CLASS,
      successUrl: window.location.origin + '/#pro?checkout=success',
      theme: 'light',
      onEvent: (ev) => {
        if (cancelled) return
        const name = ev?.name || ev?.event_name
        if (name === 'checkout.loaded') {
          window.clearTimeout(readyFallback)
          window.clearTimeout(loadTimeout)
          setStatus('ready')
        } else if (name === 'checkout.completed') {
          window.clearTimeout(readyFallback)
          window.clearTimeout(loadTimeout)
          setStatus('completed')

          // Capture the session details BEFORE clearSession() — we need
          // type/tier/expectedCredits to seed the optimistic state below.
          const completed = readSession()
          clearSession()

          // ─────────────────────────────────────────────────────────
          // Optimistic state — flip the sidebar/badges INSTANTLY.
          //
          // Webhook delivery + 2s polling cadence add up to 3-7 s of
          // visible "still on Free / 0 credits" before the new state
          // shows up. That's the worst possible UX for a paying user.
          // We know what they bought (sessionStorage), so paint the
          // expected end-state RIGHT NOW. The next fetch (kicked off
          // ~150 ms later by refreshBillingState) reconciles to the
          // server's truth and silently overwrites the optimistic
          // entry — no visible flicker if both match, smooth fallback
          // to free if Paddle ultimately failed (caught by the
          // PaymentProcessingBanner timeout path).
          // ─────────────────────────────────────────────────────────
          if (completed?.type === 'subscription') {
            // Subscription tier flips first — the sidebar reads this
            // for plan name + tier badge.
            queryClient.setQueryData(queryKeys.billing.subscription, (current) => ({
              ...(current || {}),
              plan_slug: completed.planSlug || current?.plan_slug,
              plan_name: completed.planName || current?.plan_name,
              tier: completed.tier || current?.tier,
              status: 'trialing', // 7-day trial by default
              is_trial: true,
              billing_period: completed.cycle === 'annual' ? 'year' : 'month',
              plan_credits: completed.expectedCredits || current?.plan_credits,
              // Trial period gives 100 credits — see TRIAL_CREDIT_GRANT
              // on the backend. Show that immediately. If the user
              // selected skip-trial, the webhook reconciles to the
              // full plan amount on next poll.
            }))
            queryClient.setQueryData(queryKeys.billing.credits, (current) => {
              const permanent = Number(current?.permanent_credits || 0)
              const subCreditsOptimistic = 100 // trial grant
              return {
                ...(current || {}),
                subscription_credits: subCreditsOptimistic,
                permanent_credits: permanent,
                total: permanent + subCreditsOptimistic,
              }
            })
          } else if (completed?.expectedCredits && completed?.type === 'pack') {
            // Pack purchase — bump permanent_credits immediately.
            // (The CreditPacksModal does this same trick for in-modal
            // purchases; this branch covers the unusual path of buying
            // a pack via the full CheckoutScreen flow.)
            queryClient.setQueryData(queryKeys.billing.credits, (current) => {
              const permanent = Number(current?.permanent_credits || 0) + completed.expectedCredits
              const sub = Number(current?.subscription_credits || 0)
              return {
                ...(current || {}),
                permanent_credits: permanent,
                total: sub + permanent,
              }
            })
          }

          // Fan-out invalidate so the network refetch hits within ~150 ms
          // and reconciles the optimistic data with the server's truth.
          refreshBillingState(queryClient)

          // Kick the activation store into burst mode IMMEDIATELY via
          // the Zustand store, not via a window event. CheckoutScreen
          // renders without AppShellLayout (see App.jsx ~L496), so
          // `<ActivationListener>` isn't mounted right now and any
          // window event we dispatch goes into the void. Calling
          // store.start() directly bypasses the event listener entirely
          // — the burst-mode flag + /sync fire-now logic persist in
          // Zustand state across the redirect to /pro, so when the
          // splash mounts (inside AppShellLayout on /pro) a moment
          // later it reads isPending=true and shows "Activating your
          // subscription…" without the race-y window-event handoff.
          //
          // We still dispatch the window event for any in-tree
          // listener that might exist (PaymentProcessingBanner etc.)
          // and as defense-in-depth for deep-link cases.
          useSubscriptionActivationStore.getState().start()
          window.dispatchEvent(new CustomEvent('app:checkout-completed'))

          // 400 ms (was 1200 ms) — short enough that the user feels
          // the redirect as immediate, long enough to read "Payment
          // confirmed." With the optimistic update above, the
          // sidebar will already show the new plan when they land
          // on the pricing page.
          window.setTimeout(() => {
            window.location.hash = 'pro?checkout=success'
          }, 400)
        } else if (name === 'checkout.error' || name === 'checkout.failed') {
          window.clearTimeout(readyFallback)
          window.clearTimeout(loadTimeout)

          console.error('[Paddle] checkout.error payload:', ev)
          setStatus('error')
          setError(
            ev?.data?.error?.detail ||
              ev?.data?.error?.message ||
              ev?.error?.detail ||
              ev?.error?.message ||
              'Payment could not be started. Please try again.'
          )
        }
      },
    }).catch((e) => {
      if (cancelled) return
      window.clearTimeout(readyFallback)
      window.clearTimeout(loadTimeout)

      console.error('[Paddle] openPaddleInlineCheckout rejected:', e)
      setStatus('error')
      setError(friendlyMessage(e) || 'Could not load the checkout. Please try again.')
    })

    return () => {
      cancelled = true
      window.clearTimeout(readyFallback)
      window.clearTimeout(loadTimeout)
      // No Paddle.Checkout.close() here — paddle.js does that on the
      // next open(), and calling it during StrictMode's transient
      // cleanup cancels the in-flight iframe load.
    }
  }, [session, queryClient, retryNonce])

  const handleRetry = useCallback(() => {
    setRetryNonce((n) => n + 1)
  }, [])

  if (!session) return null

  const planName = session.planName || 'Subscription'
  const totalDueDisplay = session.totalDueDisplay || session.priceDisplay || ''
  const cycleNoun = session.cycle === 'annual' ? 'annually' : 'monthly'
  const renewalPeriod = session.cycle === 'annual' ? 'year' : 'month'

  return (
    <div className="checkout-screen" role="dialog" aria-modal="true" aria-label="Checkout">
      <header className="checkout-bar">
        <div className="checkout-bar-left">
          <button
            type="button"
            className="checkout-back"
            onClick={onClose}
            aria-label="Back to pricing"
          >
            <ArrowLeft size={18} strokeWidth={2} />
          </button>
          <div className="checkout-brand">
            <span className="checkout-brand-mark" aria-hidden="true">
              C
            </span>
            <span className="checkout-brand-name">Clixa</span>
          </div>
        </div>
        <div className="checkout-bar-trust" aria-hidden="true">
          <Lock size={12} strokeWidth={2.4} />
          <span>Secure checkout</span>
        </div>
      </header>

      <main className="checkout-main">
        <motion.section
          className="checkout-summary"
          aria-label="Order summary"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 0.61, 0.36, 1] }}
        >
          <p className="checkout-summary-eyebrow">Subscribe to Clixa {planName}</p>
          <div className="checkout-summary-price">
            <span className="checkout-summary-amount">{totalDueDisplay}</span>
            <span className="checkout-summary-cycle">per {renewalPeriod}</span>
          </div>

          <div className="checkout-summary-divider" />

          <div className="checkout-line-items">
            <div className="checkout-line-item">
              <span className="checkout-line-item-icon" aria-hidden="true">
                <Sparkles size={16} strokeWidth={2} />
              </span>
              <div className="checkout-line-item-name">
                <span className="checkout-line-item-title">Clixa {planName}</span>
                <span className="checkout-line-item-sub">Billed {cycleNoun}</span>
              </div>
              <span className="checkout-line-item-price">{totalDueDisplay}</span>
            </div>
          </div>

          <div className="checkout-summary-divider" />

          <dl className="checkout-totals">
            <div className="checkout-total-row">
              <dt>Subtotal</dt>
              <dd>{totalDueDisplay}</dd>
            </div>
            <div className="checkout-total-row checkout-total-row--muted">
              <dt className="checkout-total-row-label">
                <span>Tax</span>
                <Info
                  size={13}
                  strokeWidth={2}
                  className="checkout-tax-info"
                  aria-label="Sales tax or VAT calculated at checkout based on your billing country"
                />
              </dt>
              <dd>—</dd>
            </div>
            <div className="checkout-total-row checkout-total-row--grand">
              <dt>Total due today</dt>
              <dd>{totalDueDisplay}</dd>
            </div>
          </dl>

          <p className="checkout-renewal">
            Renews automatically every {renewalPeriod} for <strong>{totalDueDisplay}</strong>.
            Cancel anytime.
          </p>

          <div className="checkout-trust">
            <ShieldCheck size={14} strokeWidth={2} />
            <span>7-day money-back guarantee</span>
          </div>
        </motion.section>

        <motion.section
          className="checkout-form"
          aria-label="Payment details"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 0.61, 0.36, 1], delay: 0.05 }}
        >
          <div className="checkout-form-card">
            <header className="checkout-form-head">
              <h2 className="checkout-form-title">Payment details</h2>
              <p className="checkout-form-sub">Card, Apple Pay, Google Pay, and PayPal.</p>
            </header>

            <div className="checkout-frame-wrap" data-status={status}>
              <AnimatePresence>
                {(status === 'idle' || status === 'mounting') && (
                  <motion.div
                    key="skeleton"
                    className="checkout-skeleton"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    aria-hidden="true"
                  >
                    <div className="checkout-skeleton-bar" />
                    <div className="checkout-skeleton-bar checkout-skeleton-bar--narrow" />
                    <div className="checkout-skeleton-bar" />
                    <div className="checkout-skeleton-bar checkout-skeleton-bar--button" />
                  </motion.div>
                )}

                {status === 'completed' && (
                  <motion.div
                    key="success"
                    className="checkout-success"
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
                    role="status"
                  >
                    <motion.span
                      className="checkout-success-icon"
                      initial={{ scale: 0.6, rotate: -8 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 280, damping: 18 }}
                    >
                      <CheckCircle2 size={56} strokeWidth={1.6} />
                    </motion.span>
                    <p className="checkout-success-title">Payment confirmed</p>
                    <p className="checkout-success-sub">
                      Your subscription is active. Redirecting…
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className={`${FRAME_TARGET_CLASS} checkout-frame-mount`} />
            </div>

            <AnimatePresence>
              {status === 'error' && (
                <motion.div
                  key="error"
                  className="checkout-error"
                  role="alert"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <p className="checkout-error-text">
                    {error || 'Something went wrong. Please try again.'}
                  </p>
                  <button type="button" className="checkout-error-retry" onClick={handleRetry}>
                    <RotateCw size={14} strokeWidth={2} />
                    <span>Try again</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <footer className="checkout-form-foot">
              <span className="checkout-form-foot-powered">
                Powered by <strong>Paddle</strong>
              </span>
              <span className="checkout-form-foot-sep" aria-hidden="true" />
              <a
                className="checkout-form-foot-link"
                href="https://www.paddle.com/legal/checkout-buyer-terms"
                target="_blank"
                rel="noopener noreferrer"
              >
                Terms
              </a>
              <span className="checkout-form-foot-sep" aria-hidden="true" />
              <a
                className="checkout-form-foot-link"
                href="https://www.paddle.com/legal/privacy"
                target="_blank"
                rel="noopener noreferrer"
              >
                Privacy
              </a>
            </footer>
          </div>
        </motion.section>
      </main>
    </div>
  )
}

export default CheckoutScreen
