import { useEffect, useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { Dialog } from '../components/ui/Dialog'
import { AlertIcon, GoogleIcon, AppleIcon } from './_icons'
import { AuthBrandPane } from './_AuthBrandPane'
import './auth.css'

/**
 * AuthDialog — single dialog for both first-time signup and returning sign-in.
 *
 * Architecture choice: we don't split into Login / Signup any more. The OAuth
 * provider (Google) is the same in both cases, and the backend already
 * distinguishes brand-new users from returning ones — so there's nothing to
 * decide on the client. One dialog, one button, one happy path.
 *
 * Marketing-consent capture lives in Settings → Email preferences (default
 * off, GDPR-safe). It does not belong in the auth modal.
 */

const LAST_PROVIDER_KEY = 'clixa_last_oauth_provider'

function readLastProvider() {
  try {
    return localStorage.getItem(LAST_PROVIDER_KEY)
  } catch {
    return null
  }
}

function writeLastProvider(provider) {
  try {
    localStorage.setItem(LAST_PROVIDER_KEY, provider)
  } catch {
    /* storage may be blocked — silent fail; the badge just won't appear */
  }
}

const CloseIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 3l10 10M13 3L3 13" />
  </svg>
)

export function AuthDialog({ onClose, oauthInProgress = false }) {
  // While we're rendered as the dialog for a returning OAuth callback,
  // surface the spinner immediately on the Google row so the user sees one
  // continuous "Connecting…" state from click → Google → back-to-clixa →
  // exchange → splash.
  const [pendingProvider, setPendingProvider] = useState(oauthInProgress ? 'google' : null)
  const [lastProvider] = useState(() => readLastProvider())

  const {
    signInWithGoogle,
    isLoading: storeLoading,
    error: storeError,
    clearError,
  } = useAuthStore()

  useEffect(() => {
    clearError()
  }, [clearError])

  const handleProvider = async (provider) => {
    if (pendingProvider) return
    setPendingProvider(provider)
    clearError()
    writeLastProvider(provider)
    // Intent is 'signin' for the unified dialog. The backend's
    // get_or_create_from_oauth handles brand-new vs returning automatically;
    // the intent just keeps the post-redirect re-mount targeting this same
    // dialog (with loading overlay) instead of a generic splash.
    const result = await signInWithGoogle('signin')
    if (!result?.ok) {
      setPendingProvider(null)
    }
    // On success the auth store sets the session; App.jsx handles the
    // welcome splash → thumbnails handoff.
  }

  const loading = storeLoading || pendingProvider !== null || oauthInProgress

  return (
    <Dialog
      open
      onClose={oauthInProgress ? () => {} : () => onClose?.()}
      size="lg"
      className="auth-dialog-panel"
      ariaLabelledBy="auth-dialog-title"
    >
      {!oauthInProgress && (
        <button
          type="button"
          className="auth-dialog-close"
          onClick={() => onClose?.()}
          aria-label="Close"
        >
          <CloseIcon />
        </button>
      )}

      {oauthInProgress && (
        <div className="auth-dialog-loading" role="status" aria-live="polite">
          <h1 className="auth-title">Signing you in…</h1>
          <p className="auth-subtitle">Finishing up with Google. Hang tight.</p>
          <span className="auth-dialog-loading-spinner" aria-hidden="true" />
        </div>
      )}

      <div className="auth-split">
        <AuthBrandPane />
        <div className="auth-content">
          <div className="auth-content-main">
            <div className="auth-card-head">
              <h1 id="auth-dialog-title" className="auth-title">
                Continue to Clixa
              </h1>
              <p className="auth-subtitle">Sign in or create an account in one tap.</p>
            </div>

            {storeError && (
              <div className="ax-alert ax-alert-error" role="alert">
                <span className="ax-alert-icon">
                  <AlertIcon />
                </span>
                <div className="ax-alert-body">
                  <p>{storeError}</p>
                </div>
              </div>
            )}

            <div className="auth-oauth-stack">
              <div className="auth-oauth-wrap">
                {lastProvider === 'google' && <span className="auth-oauth-last">Last used</span>}
                <button
                  type="button"
                  className={`auth-oauth${pendingProvider === 'google' ? ' is-loading' : ''}`}
                  onClick={() => handleProvider('google')}
                  disabled={loading}
                  aria-busy={pendingProvider === 'google'}
                >
                  <span className="auth-oauth-icon">
                    {pendingProvider === 'google' ? (
                      <span className="auth-oauth-spinner" aria-hidden="true" />
                    ) : (
                      <GoogleIcon />
                    )}
                  </span>
                  <span>
                    {pendingProvider === 'google' ? 'Connecting…' : 'Continue with Google'}
                  </span>
                </button>
              </div>

              <div className="auth-oauth-wrap">
                <span className="auth-oauth-soon">Coming soon</span>
                <button
                  type="button"
                  className="auth-oauth is-coming-soon"
                  disabled
                  title="Apple Sign-In coming soon"
                >
                  <span className="auth-oauth-icon">
                    <AppleIcon />
                  </span>
                  <span>Continue with Apple</span>
                </button>
              </div>
            </div>

            <p className="auth-help">
              Need help?{' '}
              <a href="mailto:support@clixa.app" className="auth-help-link">
                Contact support
              </a>
            </p>
          </div>

          <p className="auth-legal">
            By continuing you agree to our{' '}
            <a href="#terms" className="ax-link-inline">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="#privacy" className="ax-link-inline">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    </Dialog>
  )
}
