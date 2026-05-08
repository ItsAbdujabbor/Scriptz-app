import { useState } from 'react'
import { Dialog } from '../components/ui/Dialog'
import { ShieldIcon, MailIcon } from './_icons'
import './auth.css'

/**
 * Banned-account dialog. Rendered as a non-dismissible Dialog (the
 * user shouldn't be able to escape it with Esc/backdrop click — the
 * only way out is signing out via the explicit button). All other
 * auth dialogs allow backdrop close.
 */
export function BannedScreen({ email, banDate, reason, onLogout }) {
  const [copied, setCopied] = useState(false)
  const supportEmail = 'support@clixa.app'

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard?.writeText(supportEmail)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard API unavailable — silent fail; the address is visible */
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return null
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

  const niceDate = formatDate(banDate)
  const hasMeta = email || niceDate || reason

  return (
    <Dialog
      open
      onClose={() => {}}
      size="md"
      closeOnBackdrop={false}
      closeOnEscape={false}
      ariaLabelledBy="auth-banned-title"
    >
      <div className="auth-content">
        <div className="auth-card-head">
          <div className="ax-icon-badge is-danger" aria-hidden="true">
            <ShieldIcon />
          </div>
          <h1 id="auth-banned-title" className="auth-title">Account suspended</h1>
          <p className="auth-subtitle">
            Your Clixa AI account has been suspended due to a violation of our Terms of Service.
            If you believe this is a mistake, our support team will review your appeal.
          </p>
        </div>

        {hasMeta && (
          <div className="banned-meta">
            {email && (
              <div className="banned-meta-row">
                <span className="banned-meta-label">Email</span>
                <span className="banned-meta-value">{email}</span>
              </div>
            )}
            {niceDate && (
              <div className="banned-meta-row">
                <span className="banned-meta-label">Suspended on</span>
                <span className="banned-meta-value">{niceDate}</span>
              </div>
            )}
            {reason && (
              <div className="banned-meta-row">
                <span className="banned-meta-label">Reason</span>
                <span className="banned-meta-value">{reason}</span>
              </div>
            )}
          </div>
        )}

        <div className="banned-support">
          <h3 className="banned-support-title">Appeal this decision</h3>
          <p className="banned-support-text">
            Email our support team and we&apos;ll review your case within 24–48 hours.
          </p>
          <button type="button" className="banned-email-btn" onClick={handleCopyEmail}>
            <MailIcon />
            <span>{supportEmail}</span>
            <span className={`banned-copy-hint ${copied ? 'is-copied' : ''}`}>
              {copied ? 'Copied' : 'Copy'}
            </span>
          </button>
        </div>

        <button type="button" className="ax-btn ax-btn-secondary" onClick={() => onLogout?.()}>
          Sign out
        </button>

        <p className="banned-footer">All appeals are reviewed manually.</p>
      </div>
    </Dialog>
  )
}
