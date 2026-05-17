/**
 * ProScreen — fullscreen pricing takeover (rebuilt from scratch).
 *
 * Self-contained surface mounted OVER the rest of the app. Owns its
 * own background (gradient base + animated orbs + dot texture), close
 * affordance, scroll container, and content composition.
 *
 * No legacy CSS — `ProScreen.css` is the only stylesheet this surface
 * needs. All inner class names are scoped under `.pro-screen` so this
 * file does not affect the landing-page pricing or any other module.
 */
import { useCallback, useEffect, useRef } from 'react'
import { ProPricingContent } from './ProPricingContent'
import './ProScreen.css'

function CloseGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
    </svg>
  )
}

export function ProScreen({ onClose }) {
  const rootRef = useRef(null)
  const closeBtnRef = useRef(null)
  const triggerRef = useRef(null)

  const handleClose = useCallback(() => {
    onClose?.()
  }, [onClose])

  // This is a full-page takeover, not a modal dialog — so it carries
  // `role="region"` rather than `role="dialog"`. We still need to manage
  // focus: pull it into the surface on open (first heading if present,
  // else the close button) and return it to whatever opened the screen
  // on unmount.
  useEffect(() => {
    triggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const heading = rootRef.current?.querySelector('h1, h2, [role="heading"]')
    if (heading) {
      if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
      heading.focus()
    } else {
      closeBtnRef.current?.focus()
    }

    return () => {
      triggerRef.current?.focus?.()
    }
  }, [])

  // Esc closes — same contract every modal in the app exposes.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        handleClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleClose])

  // Lock body scroll while the screen is open so the page underneath
  // can't scroll behind the takeover. Restored on unmount.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Trial CTA → registration flow (kept identical to the previous Pro
  // page so existing telemetry / flows still work).
  const handleStartTrial = useCallback(() => {
    window.location.hash = 'register'
  }, [])

  return (
    <div ref={rootRef} className="pro-screen" role="region" aria-label="Upgrade to Pro">
      {/* Animated background blobs — drift slowly to give the surface
       *  a "living" feel without burning paint. Sit at z-index 0,
       *  below content (z-index 2). */}
      <div className="pro-orbs" aria-hidden="true">
        <div className="pro-orb pro-orb-1" />
        <div className="pro-orb pro-orb-2" />
        <div className="pro-orb pro-orb-3" />
      </div>

      <button
        ref={closeBtnRef}
        type="button"
        className="pro-screen-close"
        onClick={handleClose}
        aria-label="Close pricing"
      >
        <CloseGlyph />
      </button>

      <div className="pro-screen-scroll">
        <div className="pro-screen-inner">
          <ProPricingContent onStartTrial={handleStartTrial} />
        </div>
      </div>
    </div>
  )
}

export default ProScreen
