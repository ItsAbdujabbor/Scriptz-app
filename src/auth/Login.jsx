import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import { isLocalApiAuthMode } from '../lib/authMode'
import './auth.css'

const MailIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" width="16" height="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6l7 5 7-5" />
    <rect x="2" y="4" width="16" height="12" rx="2" />
  </svg>
)
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
const LoginIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" width="20" height="20" stroke="currentColor" strokeWidth="2">
    <path d="M15 3H19C20.1 3 21 3.9 21 5V19C21 20.1 20.1 21 19 21H15" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 17L15 12L10 7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15 12H3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const CheckIcon = () => (
  <svg viewBox="0 0 14 14" fill="none" width="14" height="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 7l3 3 7-7" />
  </svg>
)
const ScriptzLogo = () => (
  <svg viewBox="0 0 24 24" fill="none" width="24" height="24">
    <path d="M7 8h7l4 4-4 4H7l4-4-4-4z" fill="currentColor" />
    <path d="M11 18h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
)

const BRAND_FEATURES = [
  'AI script generation tailored to your audience',
  'Thumbnails powered by Imagen 4',
  'YouTube analytics & growth insights',
]

export function Login({ onBack, onGoToSignup, onGoToForgotPassword, onSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({ email: '', password: '' })

  const {
    login,
    signInWithGoogle,
    resendSignupEmail,
    isLoading: loading,
    error: storeError,
    clearError,
  } = useAuthStore()
  const [showResendConfirmation, setShowResendConfirmation] = useState(false)
  const [resendBusy, setResendBusy] = useState(false)

  useEffect(() => {
    clearError()
  }, [clearError])

  const submitError = storeError || ''

  const validate = () => {
    const next = { email: '', password: '' }
    const emailTrim = email.trim()
    if (!emailTrim) next.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) next.email = 'Enter a valid email'
    if (!password) next.password = 'Password is required'
    setErrors(next)
    return !next.email && !next.password
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    clearError()
    setShowResendConfirmation(false)
    const result = await login(email.trim(), password)
    if (result?.ok) {
      onSuccess?.()
    } else if (result?.needsEmailConfirmation) {
      setShowResendConfirmation(true)
    }
  }

  const handleGoogle = async () => {
    clearError()
    setShowResendConfirmation(false)
    await signInWithGoogle()
  }

  const handleResendConfirmation = async () => {
    const em = email.trim()
    if (!em) return
    setResendBusy(true)
    clearError()
    await resendSignupEmail(em)
    setResendBusy(false)
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
            Turn your ideas into <em>viral scripts</em>
          </h2>
          <p className="auth-brand-sub">
            AI-powered tools built for YouTube creators who want to grow faster.
          </p>
          <ul className="auth-brand-features">
            {BRAND_FEATURES.map((text, i) => (
              <li key={i}>
                <CheckIcon />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="auth-panel-form">
        <div className="auth-wrap">
          <a href="#" className="auth-back" onClick={(e) => { e.preventDefault(); onBack?.() }} aria-label="Back">
            <BackIcon />
            Back
          </a>
          <div className="auth-card">
            <span className="auth-eyebrow">Sign in</span>
            <div className="auth-card-icon" aria-hidden="true">
              <LoginIcon />
            </div>
            <h1 className="auth-title">Welcome back</h1>
            <p className="auth-subtitle">Log in to your Scriptz AI account to continue.</p>

            {submitError && <p className="auth-error-msg" role="alert">{submitError}</p>}
            {showResendConfirmation && !isLocalApiAuthMode() && (
              <div className="auth-inline-action" role="status">
                <p className="auth-inline-action-text">We sent a confirmation link to this address. You can resend it if you didn&apos;t receive it.</p>
                <button
                  type="button"
                  className="auth-btn auth-btn-secondary auth-btn-compact"
                  onClick={handleResendConfirmation}
                  disabled={resendBusy || loading}
                >
                  {resendBusy ? 'Sending…' : 'Resend confirmation email'}
                </button>
              </div>
            )}

            {!isLocalApiAuthMode() && (
              <>
                <button
                  type="button"
                  className="auth-btn auth-btn-google"
                  onClick={handleGoogle}
                  disabled={loading}
                >
                  Continue with Google
                </button>
                <p className="auth-divider"><span>or email</span></p>
              </>
            )}

            <form className="auth-form" onSubmit={handleSubmit} noValidate>
              <div className="form-group">
                <label htmlFor="login-email" className="form-label">Email address</label>
                <div className="form-field">
                  <span className="form-field-icon" aria-hidden="true"><MailIcon /></span>
                  <input
                    type="email"
                    id="login-email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setErrors((prev) => ({ ...prev, email: '' })) }}
                    className={`form-input ${errors.email ? 'form-input-error' : ''}`}
                    disabled={loading}
                  />
                </div>
                {errors.email && <p className="form-error" role="alert">{errors.email}</p>}
              </div>

              <div className="form-group">
                <label htmlFor="login-password" className="form-label">Password</label>
                <div className="form-field">
                  <span className="form-field-icon" aria-hidden="true"><LockIcon /></span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="login-password"
                    autoComplete="current-password"
                    placeholder="Your password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setErrors((prev) => ({ ...prev, password: '' })) }}
                    className={`form-input form-input-toggleable ${errors.password ? 'form-input-error' : ''}`}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="form-pwd-toggle"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                {errors.password && <p className="form-error" role="alert">{errors.password}</p>}
              </div>

              <div className="auth-form-meta">
                <label className="auth-remember">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />
                  <span className="auth-remember-box" />
                  <span>Remember me</span>
                </label>
                <a href="#forgot-password" className="auth-link" onClick={(e) => { e.preventDefault(); onGoToForgotPassword?.(); }}>Forgot password?</a>
              </div>

              <button type="submit" className="auth-btn" disabled={loading}>
                {loading ? <span className="auth-btn-spinner" /> : null}
                <span>{loading ? 'Signing in…' : 'Log in'}</span>
              </button>
            </form>

            <p className="auth-footer">
              Don&apos;t have an account?{' '}
              <a href="#register" className="auth-link auth-link-bold" onClick={(e) => { e.preventDefault(); onGoToSignup?.() }}>
                Create one free →
              </a>
            </p>
            <p className="auth-legal-notice">
              By signing in you agree to our{' '}
              <a href="#terms" className="auth-link-inline">Terms of Service</a>
              {' '}and{' '}
              <a href="#privacy" className="auth-link-inline">Privacy Policy</a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
