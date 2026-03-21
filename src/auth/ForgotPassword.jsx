import { useState, useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'
import './auth.css'

const MailIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" width="16" height="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6l7 5 7-5" />
    <rect x="2" y="4" width="16" height="12" rx="2" />
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

export function ForgotPassword({ onBack, onGoToLogin }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [errors, setErrors] = useState({ email: '' })

  const { forgotPassword, isLoading: loading, error: storeError, clearError } = useAuthStore()

  useEffect(() => {
    clearError()
  }, [clearError])

  const validate = () => {
    const emailTrim = email.trim()
    if (!emailTrim) {
      setErrors({ email: 'Email is required' })
      return false
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      setErrors({ email: 'Enter a valid email' })
      return false
    }
    setErrors({ email: '' })
    return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    clearError()
    const result = await forgotPassword(email.trim())
    if (result?.ok) setSent(true)
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
            Reset your <em>password</em>
          </h2>
          <p className="auth-brand-sub">
            We&apos;ll send you a link to create a new password. Check your inbox and spam folder.
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
          <a href="#" className="auth-back" onClick={(e) => { e.preventDefault(); onGoToLogin?.() }} aria-label="Back to login">
            <BackIcon />
            Back to login
          </a>
          <div className="auth-card">
            <span className="auth-eyebrow">Forgot password</span>
            <h1 className="auth-title">Reset password</h1>
            <p className="auth-subtitle">Enter your account email and we&apos;ll send you a reset link.</p>

            {sent ? (
              <div className="auth-success-msg" role="status">
                Check your inbox. If an account exists for <strong>{email.trim()}</strong>, you&apos;ll receive a password reset link shortly.
              </div>
            ) : (
              <>
                {storeError && <p className="auth-error-msg" role="alert">{storeError}</p>}
                <form className="auth-form" onSubmit={handleSubmit} noValidate>
                  <div className="form-group">
                    <label htmlFor="forgot-email" className="form-label">Email address</label>
                    <div className="form-field">
                      <span className="form-field-icon" aria-hidden="true"><MailIcon /></span>
                      <input
                        type="email"
                        id="forgot-email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setErrors({ email: '' }) }}
                        className={`form-input ${errors.email ? 'form-input-error' : ''}`}
                        disabled={loading}
                      />
                    </div>
                    {errors.email && <p className="form-error" role="alert">{errors.email}</p>}
                  </div>
                  <button type="submit" className="auth-btn" disabled={loading}>
                    {loading ? <span className="auth-btn-spinner" /> : null}
                    <span>{loading ? 'Sending…' : 'Send reset link'}</span>
                  </button>
                </form>
              </>
            )}

            <p className="auth-footer">
              Remember your password?{' '}
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
