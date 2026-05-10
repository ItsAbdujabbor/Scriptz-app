import { useEffect, useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import { Dialog } from '../components/ui/Dialog'
import { AlertIcon, GoogleIcon, AppleIcon } from './_icons'
import { AuthBrandPane } from './_AuthBrandPane'
import './auth.css'

/* Same last-used-provider memory as the Login screen — stored under
 * the same key so a returning user always sees their preferred provider
 * highlighted, regardless of which entry point they used. */
const LAST_PROVIDER_KEY = 'clixa_last_oauth_provider'
const LEGACY_LAST_PROVIDER_KEY = 'scriptz_last_oauth_provider'
function readLastProvider() {
  try {
    let v = localStorage.getItem(LAST_PROVIDER_KEY)
    if (!v) {
      // One-shot migration from the legacy "scriptz_*" brand key.
      const legacy = localStorage.getItem(LEGACY_LAST_PROVIDER_KEY)
      if (legacy) {
        localStorage.setItem(LAST_PROVIDER_KEY, legacy)
        v = legacy
      }
      localStorage.removeItem(LEGACY_LAST_PROVIDER_KEY)
    }
    return v
  } catch {
    return null
  }
}
function writeLastProvider(provider) {
  try {
    localStorage.setItem(LAST_PROVIDER_KEY, provider)
  } catch {
    /* storage may be blocked — silent fail */
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

export function Signup({ onBack, onSuccess, oauthInProgress = false }) {
  // If we're rendered as the dialog for a returning OAuth callback,
  // surface the spinner immediately on the Google row so the user
  // sees one continuous "Connecting…" state from click → Google →
  // back-to-clixa → exchange → done.
  const [pendingProvider, setPendingProvider] = useState(oauthInProgress ? 'google' : null)
  const [lastProvider, setLastProvider] = useState(() => readLastProvider())

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
    setLastProvider(provider)
    // Pass `'signup'` as the intent so on the OAuth callback round-trip
    // the dialog re-mounts in signup mode (with this same overlay) —
    // not a generic full-screen splash.
    const result = await signInWithGoogle('signup')
    if (result?.ok) {
      onSuccess?.()
      return
    }
    setPendingProvider(null)
  }

  const loading = storeLoading || pendingProvider !== null || oauthInProgress

  return (
    <Dialog
      open
      onClose={oauthInProgress ? () => {} : () => onBack?.()}
      size="lg"
      className="auth-dialog-panel"
      ariaLabelledBy="auth-signup-title"
    >
      {!oauthInProgress && (
        <button
          type="button"
          className="auth-dialog-close"
          onClick={() => onBack?.()}
          aria-label="Close"
        >
          <CloseIcon />
        </button>
      )}

      {/* OAuth callback overlay. Reuses `.auth-title` + `.auth-subtitle`
       * (the same classes the resting dialog uses) so font size /
       * weight / gradient match exactly between the resting and
       * loading states — no visual jump on refresh. The spinner sits
       * below the type so the user reads the message first. */}
      {oauthInProgress && (
        <div className="auth-dialog-loading" role="status" aria-live="polite">
          <h1 className="auth-title">Signing you in…</h1>
          <p className="auth-subtitle">Finishing setup with Google. Hang tight.</p>
          <span className="auth-dialog-loading-spinner" aria-hidden="true" />
        </div>
      )}

      <div className="auth-split">
        <AuthBrandPane />
        <div className="auth-content">
          <div className="auth-content-main">
            <div className="auth-card-head">
              <h1 id="auth-signup-title" className="auth-title">
                Create your account
              </h1>
              <p className="auth-subtitle">Free to start — no credit card needed.</p>
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
                    {pendingProvider === 'google' ? 'Connecting…' : 'Sign Up with Google'}
                  </span>
                </button>
              </div>

              <div className="auth-oauth-wrap">
                <span className="auth-oauth-soon">Coming soon</span>
                <button
                  type="button"
                  className="auth-oauth is-coming-soon"
                  disabled
                  aria-disabled="true"
                  title="Sign up with Apple is coming soon"
                >
                  <span className="auth-oauth-icon">
                    <AppleIcon />
                  </span>
                  <span>Sign Up with Apple</span>
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
