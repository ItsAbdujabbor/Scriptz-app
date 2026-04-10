import { useState } from 'react'
import './auth.css'

const ShieldIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    width="64"
    height="64"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <path
      d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M12 8v4M12 16h.01" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const MailIcon = () => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    width="16"
    height="16"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <path d="M3 6l7 5 7-5" />
    <rect x="2" y="4" width="16" height="12" rx="2" />
  </svg>
)

export function BannedScreen({ email, banDate, reason, onLogout }) {
  const [copied, setCopied] = useState(false)

  const supportEmail = 'support@scriptz.app'

  const handleCopyEmail = () => {
    navigator.clipboard?.writeText(supportEmail)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A'
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-aura" aria-hidden="true" />

      <div className="banned-container">
        <div className="banned-icon">
          <ShieldIcon />
        </div>

        <h1 className="banned-title">Account Banned</h1>

        <p className="banned-description">
          Your Scriptz AI account has been suspended. This action was taken due to a violation of
          our terms of service.
        </p>

        <div className="banned-details">
          {email && (
            <div className="banned-detail">
              <span className="banned-detail-label">Email</span>
              <span className="banned-detail-value">{email}</span>
            </div>
          )}

          {banDate && (
            <div className="banned-detail">
              <span className="banned-detail-label">Banned On</span>
              <span className="banned-detail-value">{formatDate(banDate)}</span>
            </div>
          )}

          {reason && (
            <div className="banned-detail">
              <span className="banned-detail-label">Reason</span>
              <span className="banned-detail-value">{reason}</span>
            </div>
          )}
        </div>

        <div className="banned-support">
          <h3>Contact Support</h3>
          <p>
            If you believe this is a mistake or would like to appeal this decision, please contact
            our support team.
          </p>

          <button className="banned-email-btn" onClick={handleCopyEmail} type="button">
            <MailIcon />
            <span>{supportEmail}</span>
            <span className="banned-copy-hint">{copied ? 'Copied!' : 'Click to copy'}</span>
          </button>
        </div>

        <button className="banned-logout-btn" onClick={onLogout} type="button">
          Sign Out
        </button>

        <p className="banned-footer">We review all appeals. Response time: 24-48 hours</p>
      </div>
    </div>
  )
}
