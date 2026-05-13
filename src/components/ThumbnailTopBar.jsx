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
import { useCallback, useEffect } from 'react'

import { useSidebarStore } from '../stores/sidebarStore'
import { usePlanEntitlements } from '../queries/billing/entitlementsQueries'
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
 * Internal upgrade pill.
 *
 * The product no longer has a free-trial concept — new users get 100
 * permanent welcome credits on signup and can subscribe later if they
 * want more. So the pill collapses to a single state:
 *
 *   Free / unsubscribed user → [FREE · Go Pro]   slate tag, violet CTA
 *   Paid user (any tier)     → renders null      top-bar shows menu + credits only
 *
 * Clicking the CTA routes to `#pro` so the user picks a plan + completes
 * Paddle checkout — no in-place mutation, no spinner state, no
 * error-toast surface to maintain.
 */
function TrialPill() {
  const { isSubscribed } = usePlanEntitlements()

  const goPro = useCallback(() => {
    if (typeof window !== 'undefined') window.location.hash = 'pro'
  }, [])

  if (isSubscribed) return null

  return (
    <div className="clixa-pill__wrap">
      <button
        type="button"
        className="clixa-pill clixa-pill--trial clixa-pill--trial-free"
        onClick={goPro}
        aria-label="Unlock Pro — full access, unlimited renders"
      >
        <span className="clixa-trial__sparkle" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <circle cx="12" cy="12" r="3" fill="currentColor" />
          </svg>
        </span>
        <span className="clixa-trial__label">
          <span className="clixa-trial__label-primary">Unlock Pro</span>
          <span className="clixa-trial__label-divider" aria-hidden>
            ·
          </span>
          <span className="clixa-trial__label-secondary">Unlimited renders &amp; all features</span>
        </span>
        <span className="clixa-trial__arrow" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12h14M13 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="clixa-trial__shine" aria-hidden />
      </button>
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
