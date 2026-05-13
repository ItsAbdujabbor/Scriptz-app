/**
 * ThumbnailTopBar — single top-bar that owns the menu button, the
 * trial / upgrade pill, and the credits badge on the thumbnail
 * screen.
 *
 * Why this exists (full rationale in the plan file at
 * .claude/plans/we-need-to-completely-vectorized-quasar.md):
 * the three controls used to live in three separate components
 * with three different positioning systems and three CSS surfaces
 * that drifted out of sync. This component consolidates layout +
 * visual recipe so they read as one balanced toolbar at every
 * viewport.
 *
 *   [Menu]                [Trial / Upgrade]                [Credits]
 *   ↑40px                 ↑40px (hidden for paid users)    ↑40px (paid only)
 *
 * Coordinates with the global Sidebar via the existing
 * `useSidebarStore.setMobileOpen`. While the sidebar drawer is
 * open the in-bar menu button fades out — matches the legacy
 * `.sidebar-open-btn--hidden` behaviour the user is used to.
 *
 * Sets `body.clixa-thumb-screen` on mount so the Sidebar's own
 * `.sidebar-open-btn` (still rendered for other screens) is
 * suppressed on this screen via a single CSS rule.
 */
import { useCallback, useEffect, useState } from 'react'

import { useSidebarStore } from '../stores/sidebarStore'
import { usePlanEntitlements } from '../queries/billing/entitlementsQueries'
import { useSkipTrialMutation } from '../queries/billing/creditsQueries'
import { friendlyMessage } from '../lib/aiErrors'
import { HeaderCreditsBadge } from './HeaderCreditsBadge'
import './ThumbnailTopBar.css'

function IconMenu() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  )
}

/**
 * Internal trial / upgrade pill.
 *
 * Mirrors the credits-badge pattern: a small state tag on the left
 * (TRIAL in amber / FREE in slate), a hairline divider, then the
 * accent-gradient CTA on the right. Reads at a glance as "current
 * state | what to do about it" — no ambiguous icons that look like
 * loading spinners (a problem in the previous design).
 *
 *   Trialing user → [TRIAL · Skip Trial]   amber tag, amber CTA, in-place mutate
 *   Free user     → [FREE  · Go Pro]       slate tag, violet CTA, routes to /pro
 *   Paid Creator  → renders null (top-bar shows menu + credits only)
 *
 * Behaviour:
 *
 *   * Trial state → clicking "Skip Trial" calls /api/billing/skip-trial
 *     IN PLACE through the shared `useSkipTrialMutation` hook. The
 *     button shows a spinner while the request is in flight; double-
 *     taps are no-ops because React Query's `isPending` flag locks
 *     the button. On success the activation store fires
 *     `/api/billing/sync` and starts a 1s burst-poll so the trial
 *     state flips to active within seconds. On failure a small toast
 *     under the pill renders the structured error message and stays
 *     until the user re-tries or dismisses.
 *
 *   * Free state → clicking "Go Pro" routes to `#pro` so the user
 *     picks a plan + completes Paddle checkout. No in-place mutation
 *     here because there's no existing subscription to end — the
 *     full pricing screen is the right surface.
 */
function TrialPill() {
  const { isSubscribed, isTrial } = usePlanEntitlements()
  const [error, setError] = useState('')

  const goPro = useCallback(() => {
    if (typeof window !== 'undefined') window.location.hash = 'pro'
  }, [])

  const skipTrialMutation = useSkipTrialMutation({
    onSuccess: () => {
      setError('')
      // Refresh-recovery is owned by `subscriptionActivationStore`
      // (kicked inside the hook's onSuccess) — it survives a reload
      // and keeps polling until the webhook arrives or the 60s
      // backstop fires /sync. Nothing else to do here.
    },
    onError: (err) => {
      // PAYMENT_METHOD_REQUIRED → Paddle rejected the immediate bill
      // because the subscription has no card on file. Route the user
      // straight to /pro where Paddle's checkout overlay captures the
      // card AND ends the trial in one flow (same end-state as
      // skip-trial). No error toast in this case — the redirect IS
      // the resolution.
      if (err?.code === 'PAYMENT_METHOD_REQUIRED') {
        goPro()
        return
      }
      // NOT_TRIALING → the trial already ended (concurrent call,
      // webhook landed first, etc.). Refresh state silently; the
      // pill will re-render on the new state.
      if (err?.code === 'NOT_TRIALING') {
        setError('')
        return
      }
      const msg = friendlyMessage(err) || 'Could not end trial. Please try again in a moment.'
      setError(msg)
    },
  })

  const handleSkipTrial = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (skipTrialMutation.isPending) return
      setError('')
      skipTrialMutation.mutate()
    },
    [skipTrialMutation]
  )

  // Paid Pro (active subscription, not a trial) — nothing to upsell.
  if (isSubscribed && !isTrial) return null

  const onTrial = !!isTrial
  const tagText = onTrial ? 'Trial' : 'Free'
  const variant = onTrial ? 'clixa-pill--trial-on' : 'clixa-pill--trial-free'
  const pending = skipTrialMutation.isPending

  return (
    <div className="clixa-pill__wrap">
      <div
        className={`clixa-pill clixa-pill--trial ${variant} ${pending ? 'is-pending' : ''}`}
        role="status"
        aria-live="polite"
        onClick={onTrial ? handleSkipTrial : goPro}
      >
        <span className="clixa-trial__tag">{tagText}</span>
        <span className="clixa-trial__divider" aria-hidden />
        <button
          type="button"
          className="clixa-trial__cta"
          onClick={
            onTrial
              ? handleSkipTrial
              : (e) => {
                  e.stopPropagation()
                  goPro()
                }
          }
          disabled={pending}
          aria-busy={pending}
        >
          <span className="clixa-trial__cta-shine" aria-hidden />
          <span className="clixa-trial__cta-label">
            {pending ? (
              <>
                <span className="clixa-trial__cta-spinner" aria-hidden />
                Activating…
              </>
            ) : onTrial ? (
              'Skip Trial'
            ) : (
              'Go Pro'
            )}
          </span>
        </button>
      </div>
      {error ? (
        <div className="clixa-trial__error" role="alert">
          <span className="clixa-trial__error-text">{error}</span>
          <button
            type="button"
            className="clixa-trial__error-dismiss"
            onClick={() => setError('')}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Menu button — opens the global Sidebar drawer via the existing
 * Zustand store. Fades out while the drawer is open so it doesn't
 * compete with the drawer's own close affordance.
 */
function MenuButton() {
  const mobileOpen = useSidebarStore((s) => s.mobileOpen)
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen)
  return (
    <button
      type="button"
      className={`clixa-pill clixa-pill--menu ${mobileOpen ? 'is-hidden' : ''}`}
      onClick={() => setMobileOpen(true)}
      aria-label="Open menu"
      aria-hidden={mobileOpen}
    >
      <IconMenu />
    </button>
  )
}

export default function ThumbnailTopBar() {
  // Toggle the body class for the lifetime of the mount so the
  // Sidebar's own `.sidebar-open-btn` is suppressed on this screen
  // (it would otherwise overlap our in-bar menu button).
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    document.body.classList.add('clixa-thumb-screen')
    return () => document.body.classList.remove('clixa-thumb-screen')
  }, [])

  return (
    <header className="clixa-topbar" role="banner">
      <MenuButton />
      <div className="clixa-topbar__spacer" aria-hidden />
      <TrialPill />
      <div className="clixa-topbar__spacer" aria-hidden />
      <HeaderCreditsBadge />
    </header>
  )
}
