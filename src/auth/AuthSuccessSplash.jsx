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
 * `mode`:
 *   * 'login'  → "Welcome back" / "Setting up your workspace…"
 *   * 'signup' → "Welcome to Clixa" / "Getting your account ready…"
 */
export function AuthSuccessSplash({ mode = 'login', durationMs = 1100, onDone }) {
  useEffect(() => {
    const id = window.setTimeout(() => onDone?.(), durationMs)
    return () => window.clearTimeout(id)
  }, [durationMs, onDone])

  const isSignup = mode === 'signup'
  const headline = isSignup ? 'Welcome to Clixa' : 'Welcome back'
  const sub = isSignup ? 'Getting your account ready…' : 'Setting up your workspace…'

  return (
    <div className="auth-success-splash" role="status" aria-live="polite">
      <div className="auth-success-splash__inner">
        <h1 className="auth-success-splash__title">{headline}</h1>
        <p className="auth-success-splash__sub">{sub}</p>
        <span className="auth-success-splash__bar" aria-hidden="true" />
      </div>
    </div>
  )
}
