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
 * Internal trial / upgrade pill.
 *
 * Mirrors the credits-badge pattern: a small state tag on the left
 * (TRIAL in amber / FREE in slate), a hairline divider, then the
 * accent-gradient CTA on the right. Reads at a glance as "current
 * state | what to do about it" — no ambiguous icons that look like
 * loading spinners (a problem in the previous design).
 *
 *   Trialing user → [TRIAL · Skip Trial]   amber tag, violet CTA
 *   Free user     → [FREE  · Go Pro]       slate tag, violet CTA
 *   Paid Creator  → renders null (top-bar shows menu + credits only)
 */
function TrialPill() {
  const { isSubscribed, isTrial } = usePlanEntitlements()
  const handleClick = useCallback(() => {
    if (typeof window !== 'undefined') window.location.hash = 'pro'
  }, [])

  // Paid Pro (active subscription, not a trial) — nothing to upsell.
  if (isSubscribed && !isTrial) return null

  const onTrial = !!isTrial
  const tagText = onTrial ? 'Trial' : 'Free'
  const ctaText = onTrial ? 'Skip Trial' : 'Go Pro'
  const variant = onTrial ? 'clixa-pill--trial-on' : 'clixa-pill--trial-free'

  return (
    <div
      className={`clixa-pill clixa-pill--trial ${variant}`}
      role="status"
      aria-live="polite"
      onClick={handleClick}
    >
      <span className="clixa-trial__tag">{tagText}</span>
      <span className="clixa-trial__divider" aria-hidden />
      <button
        type="button"
        className="clixa-trial__cta"
        onClick={(e) => {
          e.stopPropagation()
          handleClick()
        }}
      >
        <span className="clixa-trial__cta-shine" aria-hidden />
        <span className="clixa-trial__cta-label">{ctaText}</span>
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
