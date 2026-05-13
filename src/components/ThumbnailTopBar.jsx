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
      <div
        className="clixa-pill clixa-pill--trial clixa-pill--trial-free"
        role="status"
        onClick={goPro}
      >
        <span className="clixa-trial__tag">Free</span>
        <span className="clixa-trial__divider" aria-hidden />
        <button
          type="button"
          className="clixa-trial__cta"
          onClick={(e) => {
            e.stopPropagation()
            goPro()
          }}
        >
          <span className="clixa-trial__cta-shine" aria-hidden />
          <span className="clixa-trial__cta-label">Go Pro</span>
        </button>
      </div>
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
