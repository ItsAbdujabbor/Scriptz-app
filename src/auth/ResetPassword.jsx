import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { isLocalApiAuthMode } from '../lib/authMode'
import './auth.css'

function parseResetTokenFromHash() {
  if (typeof window === 'undefined') return ''
  const hash = window.location.hash || ''
  const qIndex = hash.indexOf('?')
  if (qIndex === -1) return ''
  const qs = new URLSearchParams(hash.slice(qIndex + 1))
  return (qs.get('token') || '').trim()
}

async function getSessionAfterRecoveryParse() {
  if (!supabase) return null
  await supabase.auth.getSession()
  let { data: { session } } = await supabase.auth.getSession()
  if (session) return session
  await new Promise((r) => setTimeout(r, 450))
  ;({ data: { session } } = await supabase.auth.getSession())
  return session
}

const LockIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" width="16" height="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <rect x="3" y="9" width="14" height="9" rx="2" />
    <path d="M7 9V6a3 3 0 016 0v3" />
  </svg>
)
const EyeIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" width="16" height="16" stroke="currentColor" strokeWidth="1.5">
    <path d="M10 4C5.6 4 2 10 2 10s3.6 6 8 6 8-6 8-6S14.4 4 10 4z" />
    <circle cx="10" cy="10" r="2.5" />
  </svg>
)
const EyeOffIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" width="16" height="16" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 3l14 14" strokeLinecap="round" />
    <path d="M8.4 8.7a3 3 0 004 4" />
    <path d="M3.7 5.3A12 12 0 002 10s3.6 6 8 6c1.7 0 3.3-.6 4.6-1.5" />
    <path d="M7 4.4A8.5 8.5 0 0110 4c4.4 0 8 6 8 6a13 13 0 01-2.1 2.7" />
  </svg>
)
const BackIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" width="14" height="14" stroke="currentColor" strokeWidth="1.8">
    <path d="M13 4L7 10l6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const ScriptzLogo = () => (
  <svg viewBox="0 0 24 24" fill="none" width="24" height="24">
    <path d="M7 8h7l4 4-4 4H7l4-4-4-4z" fill="currentColor" />
    <path d="M11 18h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)
const CheckIcon = () => (
  <svg viewBox="0 0 14 14" fill="none" width="14" height="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 7l3 3 7-7" />
  </svg>
)

const BRAND_FEATURES = [
  'AI script generation tailored to your audience',
  'Thumbnails powered by Imagen 4',
  'YouTube analytics & growth insights',
]

export function ResetPassword({ onBack, onSuccess }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [success, setSuccess] = useState(false)
  const [errors, setErrors] = useState({ password: '', confirm: '' })
  const [checking, setChecking] = useState(() => !isLocalApiAuthMode())
  const [hasSession, setHasSession] = useState(false)
  const [localResetToken, setLocalResetToken] = useState('')

  const resetPassword = useAuthStore((s) => s.resetPassword)
  const loading = useAuthStore((s) => s.isLoading)
  const storeError = useAuthStore((s) => s.error)
  const clearError = useAuthStore((s) => s.clearError)
  const ensureSession = useAuthStore((s) => s.ensureSession)

  useEffect(() => {
    clearError()
  }, [clearError])

  useEffect(() => {
    if (isLocalApiAuthMode()) {
      const t = parseResetTokenFromHash()
      setLocalResetToken(t)
      setHasSession(Boolean(t))
      setChecking(false)
      return () => {}
    }
    let cancelled = false
    if (!isSupabaseConfigured() || !supabase) {
      setChecking(false)
      setHasSession(false)
      return () => {}
    }

    async function check() {
      await ensureSession()
      const session = await getSessionAfterRecoveryParse()
      if (!cancelled) {
        setHasSession(!!session)
        setChecking(false)
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [ensureSession])

  const validate = () => {
    const next = { password: '', confirm: '' }
    if (!password) next.password = 'Password is required'
    else if (password.length < 8) next.password = 'Use at least 8 characters'
    if (password !== confirmPassword) next.confirm = 'Passwords do not match'
    setErrors(next)
    return !next.password && !next.confirm
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    clearError()
    const result = await resetPassword(isLocalApiAuthMode() ? localResetToken : null, password)
    if (result?.ok) setSuccess(true)
  }

  if (!isLocalApiAuthMode() && !isSupabaseConfigured()) {
    return (
      <div className="auth-screen">
        <div className="auth-aura" aria-hidden="true" />
        <div className="auth-panel-form">
          <div className="auth-wrap">
            <a href="#" className="auth-back" onClick={(e) => { e.preventDefault(); onBack?.() }}>Back</a>
            <div className="auth-card">
              <h1 className="auth-title">Supabase not configured</h1>
              <p className="auth-subtitle">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to reset your password.</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (checking) {
    return (
      <div className="auth-screen">
        <div className="auth-aura" aria-hidden="true" />
        <div className="auth-panel-form">
          <div className="auth-wrap">
            <div className="auth-card" style={{ textAlign: 'center', padding: '2rem' }}>
              <p className="auth-subtitle" style={{ margin: 0 }}>Verifying reset link…</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!hasSession && !success) {
    return (
      <div className="auth-screen">
        <div className="auth-aura" aria-hidden="true" />
        <div className="auth-panel-form">
          <div className="auth-wrap">
            <a href="#" className="auth-back" onClick={(e) => { e.preventDefault(); onBack?.() }}>Back</a>
            <div className="auth-card">
              <h1 className="auth-title">Invalid or expired link</h1>
              <p className="auth-subtitle">Open the link from your latest password reset email, or request a new one from the login page.</p>
              <a href="#login" className="auth-link auth-link-bold" onClick={(e) => { e.preventDefault(); onBack?.() }}>Go to login →</a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-screen">
      <div className="auth-aura" aria-hidden="true" />
      <div className="auth-panel-brand">
        <div className="auth-brand-inner">
          <a href="#" className="auth-brand-logo" onClick={(e) => { e.preventDefault(); onBack?.() }} aria-label="Scriptz AI">
            <ScriptzLogo />
            Scriptz AI
          </a>
          <h2 className="auth-brand-headline">
            Set a new <em>password</em>
          </h2>
          <p className="auth-brand-sub">
            Choose a strong password to keep your account secure.
          </p>
          <ul className="auth-brand-features">
            {BRAND_FEATURES.map((text, i) => (
              <li key={i}><CheckIcon /><span>{text}</span></li>
            ))}
          </ul>
        </div>
      </div>

      <div className="auth-panel-form">
        <div className="auth-wrap">
          <a href="#" className="auth-back" onClick={(e) => { e.preventDefault(); onBack?.() }}><BackIcon /> Back</a>
          <div className="auth-card">
            <span className="auth-eyebrow">Reset password</span>
            <h1 className="auth-title">New password</h1>
            <p className="auth-subtitle">Enter your new password below. You can then sign in with it.</p>

            {success ? (
              <>
                <div className="auth-success-msg" role="status">Your password has been updated. You can now sign in.</div>
                <a href="#login" className="auth-btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }} onClick={(e) => { e.preventDefault(); onSuccess?.() }}>
                  Sign in
                </a>
              </>
            ) : (
              <>
                {storeError && <p className="auth-error-msg" role="alert">{storeError}</p>}
                <form className="auth-form" onSubmit={handleSubmit} noValidate>
                  <div className="form-group">
                    <label htmlFor="reset-password" className="form-label">New password</label>
                    <div className="form-field">
                      <span className="form-field-icon"><LockIcon /></span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        id="reset-password"
                        autoComplete="new-password"
                        placeholder="Min 8 characters"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: '' })) }}
                        className={`form-input form-input-toggleable ${errors.password ? 'form-input-error' : ''}`}
                        disabled={loading}
                      />
                      <button type="button" className="form-pwd-toggle" onClick={() => setShowPassword((s) => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                        {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                    {errors.password && <p className="form-error">{errors.password}</p>}
                  </div>
                  <div className="form-group">
                    <label htmlFor="reset-confirm" className="form-label">Confirm password</label>
                    <div className="form-field">
                      <span className="form-field-icon"><LockIcon /></span>
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        id="reset-confirm"
                        autoComplete="new-password"
                        placeholder="Confirm your password"
                        value={confirmPassword}
                        onChange={(e) => { setConfirmPassword(e.target.value); setErrors((p) => ({ ...p, confirm: '' })) }}
                        className={`form-input form-input-toggleable ${errors.confirm ? 'form-input-error' : ''}`}
                        disabled={loading}
                      />
                      <button type="button" className="form-pwd-toggle" onClick={() => setShowConfirm((s) => !s)} aria-label={showConfirm ? 'Hide password' : 'Show password'}>
                        {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                    {errors.confirm && <p className="form-error">{errors.confirm}</p>}
                  </div>
                  <button type="submit" className="auth-btn" disabled={loading}>
                    {loading ? <span className="auth-btn-spinner" /> : null}
                    <span>{loading ? 'Updating…' : 'Update password'}</span>
                  </button>
                </form>
              </>
            )}

            <p className="auth-footer">
              <a href="#login" className="auth-link" onClick={(e) => { e.preventDefault(); onBack?.() }}>Back to login</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
