import { useEffect, useState } from 'react'
import './Splash.css'

/**
 * Splash — full-screen branded loading state shown on app entry while
 * background prefetches resolve (session, subscription, history). Fades
 * out once `ready` is true (with a short minimum duration so it doesn't
 * flash for cached / instant-resolve users).
 *
 * Caller passes `ready={true}` once it's ok to reveal the underlying
 * view; `onDone` fires after the fade-out completes so the caller can
 * stop rendering the splash entirely.
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
      const finish = window.setTimeout(() => onDone?.(), 360)
      return () => window.clearTimeout(finish)
    }, wait)
    return () => window.clearTimeout(start)
  }, [ready, exiting, mountedAt, minDurationMs, onDone])

  return (
    <div className={`splash${exiting ? ' splash--exiting' : ''}`} role="status" aria-live="polite">
      <div className="splash-glow" aria-hidden />
      <div className="splash-grid" aria-hidden />
      <div className="splash-inner">
        <div className="splash-brand">
          <img src="/clixalogo.jpg" alt="" className="splash-logo" />
          <span className="splash-wordmark">Clixa AI</span>
        </div>
        <p className="splash-tagline">{label || 'Setting up your workspace'}</p>
        <div className="splash-dots" aria-hidden>
          <span /><span /><span />
        </div>
      </div>
    </div>
  )
}
