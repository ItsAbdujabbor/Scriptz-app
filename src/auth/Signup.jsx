import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
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
const SignupIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" width="20" height="20" stroke="currentColor" strokeWidth="2">
    <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="9" cy="7" r="4" />
    <path d="M19 8v6M22 11h-6" strokeLinecap="round" strokeLinejoin="round" />
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
  'Free to start — no credit card required',
  'Scripts optimised for virality & retention',
  'Connect your YouTube channel for insights',
]

export function Signup({ onBack, onGoToLogin, onSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [errors, setErrors] = useState({ email: '', password: '', confirm: '', terms: '' })

  const { register: doRegister, login, isLoading: loading, error: storeError, clearError } = useAuthStore()

  useEffect(() => {
    clearError()
  }, [clearError])

  const submitError = storeError || ''

  const validate = () => {
    const next = { email: '', password: '', confirm: '', terms: '' }
    const emailTrim = email.trim()
    if (!emailTrim) next.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) next.email = 'Enter a valid email'
    if (!password) next.password = 'Password is required'
    else if (password.length < 8) next.password = 'Use at least 8 characters'
    if (password !== confirmPassword) next.confirm = 'Passwords do not match'
    if (!agreeTerms) next.terms = 'Please accept the terms to continue'
    setErrors(next)
    return !next.email && !next.password && !next.confirm && !next.terms
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    clearError()
    const result = await doRegister(email.trim(), password)
    if (!result?.ok) return
    // Log in so user has a session, then show splash and go to onboarding
    const loginResult = await login(email.trim(), password)
    if (loginResult?.ok) {
      onSuccess?.()
    } else {
      onGoToLogin?.()
    }
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
            Start growing your <em>YouTube channel</em>
          </h2>
          <p className="auth-brand-sub">
            Everything you need to create, optimize, and grow — all in one place.
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
            <span className="auth-eyebrow">Get started</span>
            <div className="auth-card-icon" aria-hidden="true">
              <SignupIcon />
            </div>
            <h1 className="auth-title">Create account</h1>
            <p className="auth-subtitle">Start creating viral scripts in minutes. Free to try.</p>

            {submitError && <p className="auth-error-msg" role="alert">{submitError}</p>}

            <form className="auth-form" onSubmit={handleSubmit} noValidate>
              <div className="form-group">
                <label htmlFor="signup-email" className="form-label">Email address</label>
                <div className="form-field">
                  <span className="form-field-icon" aria-hidden="true"><MailIcon /></span>
                  <input
                    type="email"
                    id="signup-email"
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
                <label htmlFor="signup-password" className="form-label">Password</label>
                <div className="form-field">
                  <span className="form-field-icon" aria-hidden="true"><LockIcon /></span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="signup-password"
                    autoComplete="new-password"
                    placeholder="Min 8 characters"
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

              <div className="form-group">
                <label htmlFor="signup-confirm" className="form-label">Confirm password</label>
                <div className="form-field">
                  <span className="form-field-icon" aria-hidden="true"><LockIcon /></span>
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    id="signup-confirm"
                    autoComplete="new-password"
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setErrors((prev) => ({ ...prev, confirm: '' })) }}
                    className={`form-input form-input-toggleable ${errors.confirm ? 'form-input-error' : ''}`}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="form-pwd-toggle"
                    onClick={() => setShowConfirm((s) => !s)}
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                {errors.confirm && <p className="form-error" role="alert">{errors.confirm}</p>}
              </div>

              <label className="auth-terms">
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={(e) => { setAgreeTerms(e.target.checked); setErrors((prev) => ({ ...prev, terms: '' })) }}
                />
                <span className="auth-terms-box" />
                <span>
                  I agree to the{' '}
                  <a href="#terms" className="auth-link-inline">Terms of Service</a>
                  {' '}and{' '}
                  <a href="#privacy" className="auth-link-inline">Privacy Policy</a>.
                </span>
              </label>
              {errors.terms && <p className="form-error" role="alert">{errors.terms}</p>}

              <button type="submit" className="auth-btn" disabled={loading}>
                {loading ? <span className="auth-btn-spinner" /> : null}
                <span>{loading ? 'Creating account…' : 'Create account'}</span>
              </button>
            </form>

            <p className="auth-footer">
              Already have an account?{' '}
              <a href="#login" className="auth-link auth-link-bold" onClick={(e) => { e.preventDefault(); onGoToLogin?.() }}>
                Log in →
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
