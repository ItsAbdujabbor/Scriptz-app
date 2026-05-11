import { useEffect, useState } from 'react'
import './Splash.css'

/**
 * Splash — full-screen branded loading state shown on app entry while
 * background prefetches resolve (session, subscription, history). Fades
 * out once `ready` is true (with a short minimum duration so it doesn't
 * flash for cached / instant-resolve users).
 *
 * Visual: solid dark surface, centered brand mark + label, a single
 * thin indeterminate progress bar. No glow, no dot grid, no bouncing
 * dots — deliberately understated so the splash reads as "the app is
 * loading" instead of "I'm a marketing screen". Matches the style of
 * `AuthSuccessSplash` for brand consistency across boot ↔ auth-landing.
 */
export function Splash({ ready = false, onDone, label, minDurationMs = 700 }) {
  const [exiting, setExiting] = useState(false)
  const [mountedAt] = useState(() => Date.now())

  useEffect(() => {
    if (!ready || exiting) return
    const elapsed = Date.now() - mountedAt
    const wait = Math.max(0, minDurationMs - elapsed)
    const start = window.setTimeout(() => {
      setExiting(true)
      const finish = window.setTimeout(() => onDone?.(), 320)
      return () => window.clearTimeout(finish)
    }, wait)
    return () => window.clearTimeout(start)
  }, [ready, exiting, mountedAt, minDurationMs, onDone])

  return (
    <div className={`splash${exiting ? ' splash--exiting' : ''}`} role="status" aria-live="polite">
      <div className="splash__inner">
        <div className="splash__brand">
          <img src="/clixalogo.jpg" alt="" className="splash__logo" />
          <span className="splash__wordmark">Clixa AI</span>
        </div>
        <p className="splash__label">{label || 'Setting up your workspace'}</p>
        <span className="splash__bar" aria-hidden="true" />
      </div>
    </div>
  )
}
