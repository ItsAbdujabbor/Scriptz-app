import { useEffect } from 'react'
import './AuthSuccessSplash.css'

/**
 * AuthSuccessSplash — full-screen handoff between successful auth and
 * the thumbnail generator. Centered headline + a subtle subline; calls
 * `onDone` after `durationMs` so the parent can route forward.
 *
 * Visual: solid dark surface, centered text, no glow. The user
 * specifically asked for "professional and appealing, not glowing".
 *
 * No mode prop — the unified auth dialog covers both signup and signin,
 * so the splash uses one neutral headline that works for both.
 */
export function AuthSuccessSplash({ durationMs = 1100, onDone }) {
  useEffect(() => {
    const id = window.setTimeout(() => onDone?.(), durationMs)
    return () => window.clearTimeout(id)
  }, [durationMs, onDone])

  return (
    <div className="auth-success-splash" role="status" aria-live="polite">
      <div className="auth-success-splash__inner">
        <h1 className="auth-success-splash__title">Welcome to Clixa</h1>
        <p className="auth-success-splash__sub">Setting up your workspace…</p>
        <span className="auth-success-splash__bar" aria-hidden="true" />
      </div>
    </div>
  )
}
