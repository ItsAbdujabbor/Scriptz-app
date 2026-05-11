/**
 * Settings — centred dialog. Opens over whatever screen the user was
 * on, closes via the ✕ button, the Escape key, or a click on the dim
 * backdrop. Renders into a portal at document.body so the surrounding
 * layout can't clip it, and locks body scroll while open.
 *
 * Sections:
 *   1. Profile hero        — avatar, greeting, email, sign out
 *   2. Plan                — current plan + manage / upgrade CTA
 *   3. Help & Legal        — support contacts + legal pages
 *   4. Danger zone         — reset data, delete account
 *
 * The wrapper SharedSettingsModal threads in auth state from Zustand
 * and the live subscription query.
 */
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import './SettingsModal.css'
import { friendlyMessage } from '../lib/aiErrors'

/* ────────────────────────── tiny inline icons ─────────────────────── */

const I = {
  close: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  ),
  lock: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  ),
  sparkle: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 3l1.7 4.6L18 9l-4.3 1.4L12 15l-1.7-4.6L6 9l4.3-1.4z" />
    </svg>
  ),
  help: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .8-1.5 1.4-1.5 2.5" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" />
    </svg>
  ),
  scroll: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 4h12a3 3 0 0 1 3 3v13a3 3 0 0 1-3 0V8a1 1 0 0 0-1-1H4z" />
      <path d="M7 8h8M7 12h8M7 16h6" />
    </svg>
  ),
  alert: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3 1 21h22z" />
      <path d="M12 10v5" />
      <circle cx="12" cy="18" r="0.6" fill="currentColor" />
    </svg>
  ),
  arrow: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  signout: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  ),
  bell: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8a6 6 0 1 1 12 0c0 4 1.5 6 2 7H4c.5-1 2-3 2-7z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  ),
  external: () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 4h6v6" />
      <path d="M10 14 20 4" />
      <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </svg>
  ),
}

/* ──────────────────────── small subcomponents ────────────────────── */

function Avatar({ src, name, size = 'md' }) {
  const [errored, setErrored] = useState(false)
  const initial = (name || 'Y')[0].toUpperCase()
  const cls = `s-avatar s-avatar--${size}`
  if (!src || errored) {
    return (
      <span className={`${cls} s-avatar--fallback`} aria-hidden>
        <span className="s-avatar-initial">{initial}</span>
      </span>
    )
  }
  return (
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      className={cls}
      onError={() => setErrored(true)}
    />
  )
}

function SectionCard({ icon, title, subtitle, tone, children }) {
  const Icon = I[icon]
  return (
    <section className={`s-card${tone ? ` s-card--${tone}` : ''}`}>
      <header className="s-card-head">
        <span className="s-card-head-icon" aria-hidden>
          {Icon ? <Icon /> : null}
        </span>
        <div className="s-card-head-text">
          <h3 className="s-card-title">{title}</h3>
          {subtitle ? <p className="s-card-subtitle">{subtitle}</p> : null}
        </div>
      </header>
      <div className="s-card-body">{children}</div>
    </section>
  )
}

function ConfirmSheet({
  open,
  title,
  body,
  danger,
  busy,
  error,
  onCancel,
  onConfirm,
  confirmLabel = 'Confirm',
  children,
}) {
  if (!open) return null
  return (
    <div className="s-confirm-overlay" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="s-confirm" onClick={(e) => e.stopPropagation()}>
        <h4 className="s-confirm-title">{title}</h4>
        {body ? <p className="s-confirm-body">{body}</p> : null}
        {children}
        {error ? <p className="s-confirm-error">{error}</p> : null}
        <div className="s-confirm-actions">
          <button type="button" className="s-btn s-btn--ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={`s-btn ${danger ? 's-btn--danger' : 's-btn--primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Notifications — email preferences per category ─────────────────
 *
 * Renders one toggle per category. `transactional` is locked on (the
 * backend treats it as required for account safety; we mirror that lock
 * in the UI rather than letting the user attempt to disable it and get
 * a server-side override).
 *
 * Save is only enabled while the form is dirty (current values differ
 * from the server-side baseline). "Unsubscribe from all" sets every
 * non-transactional category to false in one click.
 */
const NOTIFICATION_CATEGORIES = [
  {
    key: 'transactional',
    label: 'Transactional',
    helper: 'Account, security, and billing notifications — these are required.',
    locked: true,
  },
  {
    key: 'lifecycle',
    label: 'Lifecycle',
    helper: 'Onboarding tips, inactivity nudges, and re-engagement.',
  },
  {
    key: 'marketing',
    label: 'Marketing',
    helper: 'New features, promotions, and announcements.',
  },
  {
    key: 'product_updates',
    label: 'Product updates',
    helper: 'Major product changes you might care about.',
  },
]

function Toggle({ checked, disabled, onChange, ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`s-toggle${checked ? ' is-on' : ''}${disabled ? ' is-locked' : ''}`}
      onClick={() => {
        if (disabled) return
        onChange?.(!checked)
      }}
    >
      <span className="s-toggle-thumb" aria-hidden />
    </button>
  )
}

function NotificationsSection({ preferences, loading, error, onSave }) {
  // Local draft mirrors server state until the user explicitly saves.
  // We treat `null` (auth failure) and `undefined` (still loading) the
  // same way at render time — both fall back to category defaults of
  // true so the toggles aren't all silently flipped to off mid-load.
  const baseline = preferences || {
    transactional: true,
    lifecycle: true,
    marketing: true,
    product_updates: true,
  }

  const [draft, setDraft] = useState(baseline)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null) // { kind: 'error' | 'success', message }

  // Resync the local draft whenever a fresh server snapshot arrives —
  // but only when not in the middle of a save (otherwise an in-flight
  // optimistic update would clobber the user's pending edits).
  useEffect(() => {
    if (!preferences || busy) return
    setDraft(preferences)
  }, [preferences, busy])

  const dirty = NOTIFICATION_CATEGORIES.some(
    ({ key }) => Boolean(draft[key]) !== Boolean(baseline[key])
  )

  const handleToggle = (key, next) => {
    setDraft((prev) => ({ ...prev, [key]: next }))
    setFeedback(null)
  }

  const handleSave = async () => {
    setBusy(true)
    setFeedback(null)
    try {
      const payload = {
        transactional: true,
        lifecycle: Boolean(draft.lifecycle),
        marketing: Boolean(draft.marketing),
        product_updates: Boolean(draft.product_updates),
      }
      const saved = await onSave?.(payload)
      if (saved) setDraft(saved)
      setFeedback({ kind: 'success', message: 'Preferences saved.' })
    } catch (err) {
      setFeedback({
        kind: 'error',
        message: friendlyMessage(err) || 'Could not save preferences.',
      })
    } finally {
      setBusy(false)
    }
  }

  const handleUnsubscribeAll = () => {
    setDraft((prev) => ({
      ...prev,
      lifecycle: false,
      marketing: false,
      product_updates: false,
    }))
    setFeedback(null)
  }

  return (
    <div className="s-notifs">
      {error && !preferences ? (
        <div className="s-alert s-alert--error">Couldn&apos;t load your preferences.</div>
      ) : null}
      {feedback?.kind === 'success' && (
        <div className="s-alert s-alert--success">{feedback.message}</div>
      )}
      {feedback?.kind === 'error' && (
        <div className="s-alert s-alert--error">{feedback.message}</div>
      )}

      <ul className="s-notifs-list">
        {NOTIFICATION_CATEGORIES.map(({ key, label, helper, locked }) => {
          const checked = Boolean(draft[key])
          return (
            <li key={key} className="s-notifs-row">
              <div className="s-notifs-text">
                <div className="s-notifs-label">
                  <span>{label}</span>
                  {locked ? (
                    <span className="s-notifs-required" aria-hidden>
                      Required
                    </span>
                  ) : null}
                </div>
                <p className="s-notifs-helper">{helper}</p>
              </div>
              <Toggle
                checked={locked ? true : checked}
                disabled={locked || loading || busy}
                ariaLabel={label}
                onChange={(next) => handleToggle(key, next)}
              />
            </li>
          )
        })}
      </ul>

      <div className="s-notifs-actions">
        <button
          type="button"
          className="s-btn s-btn--ghost s-btn--link"
          onClick={handleUnsubscribeAll}
          disabled={busy || loading}
        >
          Unsubscribe from all
        </button>
        <button
          type="button"
          className="s-btn s-btn--primary"
          onClick={handleSave}
          disabled={!dirty || busy || loading}
        >
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

/* ──────────────────────────── main ────────────────────────────────── */

export function SettingsModal({
  open,
  onClose,
  user,
  accountDeletePasswordOptional,
  deleteData,
  deleteAccount,
  clearLocalData,
  subscription,
  emailPreferences,
  emailPreferencesLoading,
  emailPreferencesError,
  saveEmailPreferences,
  onLogout,
}) {
  // Confirm sheets
  const [delDataOpen, setDelDataOpen] = useState(false)
  const [delDataConfirm, setDelDataConfirm] = useState('')
  const [delDataBusy, setDelDataBusy] = useState(false)
  const [delDataError, setDelDataError] = useState('')

  const [delAcctOpen, setDelAcctOpen] = useState(false)
  const [delAcctPw, setDelAcctPw] = useState('')
  const [delAcctConfirm, setDelAcctConfirm] = useState('')
  const [delAcctBusy, setDelAcctBusy] = useState(false)
  const [delAcctError, setDelAcctError] = useState('')

  // Escape closes; while open, lock body scroll.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose?.()
  }

  const handleDeleteData = async () => {
    if (delDataConfirm !== 'RESET') {
      setDelDataError('Type RESET to confirm.')
      return
    }
    setDelDataBusy(true)
    setDelDataError('')
    try {
      await deleteData?.()
      clearLocalData?.()
      setDelDataOpen(false)
      setDelDataConfirm('')
    } catch (err) {
      setDelDataError(friendlyMessage(err) || 'Could not delete data.')
    } finally {
      setDelDataBusy(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (delAcctConfirm !== 'DELETE') {
      setDelAcctError('Type DELETE to confirm.')
      return
    }
    if (!accountDeletePasswordOptional && !delAcctPw) {
      setDelAcctError('Password is required.')
      return
    }
    setDelAcctBusy(true)
    setDelAcctError('')
    try {
      await deleteAccount?.(delAcctPw)
      onLogout?.()
    } catch (err) {
      setDelAcctError(friendlyMessage(err) || 'Could not delete account.')
    } finally {
      setDelAcctBusy(false)
    }
  }

  const goToPro = () => {
    onClose?.()
    if (typeof window !== 'undefined') window.location.hash = 'pro'
  }

  const memberSinceMs =
    user?.created_at && !isNaN(Date.parse(user.created_at)) ? Date.parse(user.created_at) : null
  const memberSinceLabel = memberSinceMs
    ? new Date(memberSinceMs).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : null

  // Plan derived from subscription. `isSubscribed` covers active /
  // trialing / past_due; trial users see a different CTA than paid.
  const ACTIVE = ['active', 'trialing', 'past_due']
  const hasActivePlan = !!(subscription && ACTIVE.includes(subscription.status))
  const isTrial = !!subscription?.is_trial
  const planName = (() => {
    if (!hasActivePlan) return 'Free'
    const name = subscription.plan_name || subscription.tier || 'Pro'
    const cap = name.charAt(0).toUpperCase() + name.slice(1)
    return isTrial ? `${cap} · Trial` : cap
  })()
  const planSubtitle = hasActivePlan
    ? isTrial
      ? 'Your trial is active. Continue to keep all features after it ends.'
      : `Billed ${subscription.billing_period === 'year' ? 'annually' : 'monthly'}.`
    : 'Upgrade to unlock unlimited generations and the SRX-3 model.'

  return createPortal(
    <div className="s-dialog-backdrop" role="presentation" onMouseDown={handleBackdropClick}>
      <div
        className="s-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="s-screen">
          <header className="s-header">
            <h1 className="s-header-title">Settings</h1>
            <button
              type="button"
              className="s-icon-btn"
              onClick={onClose}
              aria-label="Close settings"
            >
              <I.close />
            </button>
          </header>

          <div className="s-scroll">
            <div className="s-content">
              {/* ── Profile hero ── */}
              <section className="s-hero">
                {onLogout ? (
                  <button
                    type="button"
                    className="s-hero-signout"
                    onClick={onLogout}
                    aria-label="Sign out"
                  >
                    <I.signout />
                    <span>Sign out</span>
                  </button>
                ) : null}
                <div className="s-hero-avatar-wrap">
                  <Avatar name={user?.email} size="xl" />
                </div>
                <div className="s-hero-info">
                  <h2 className="s-hero-greeting">{greetingFromEmail(user?.email)}</h2>
                  <p className="s-hero-email">{user?.email || '—'}</p>
                  <div className="s-hero-meta">
                    <span
                      className={`s-pill ${hasActivePlan ? 's-pill--accent' : 's-pill--muted'}`}
                    >
                      {planName}
                    </span>
                    {memberSinceLabel && (
                      <span className="s-pill s-pill--muted">Since {memberSinceLabel}</span>
                    )}
                  </div>
                </div>
              </section>

              {/* ── Plan ── */}
              <SectionCard icon="sparkle" title="Plan" subtitle={planSubtitle}>
                <button
                  type="button"
                  className="s-btn s-btn--primary s-btn--full"
                  onClick={goToPro}
                >
                  <span className="s-btn-icon" aria-hidden>
                    <I.sparkle />
                  </span>
                  <span>{hasActivePlan ? 'Manage plan' : 'Go Pro'}</span>
                  <I.arrow />
                </button>
              </SectionCard>

              {/* ── Notifications ── */}
              <SectionCard
                icon="bell"
                title="Email preferences"
                subtitle="Choose what we email you. Unsubscribing here applies to your account globally."
              >
                <NotificationsSection
                  preferences={emailPreferences}
                  loading={emailPreferencesLoading}
                  error={emailPreferencesError}
                  onSave={saveEmailPreferences}
                />
              </SectionCard>

              {/* ── Help + Legal grid ── */}
              <div className="s-grid-2">
                <SectionCard icon="help" title="Help">
                  <ul className="s-link-list">
                    <li>
                      <a href="mailto:support@clixa.app?subject=Help" className="s-link">
                        <span>Help center</span>
                        <I.arrow />
                      </a>
                    </li>
                    <li>
                      <a href="mailto:support@clixa.app" className="s-link">
                        <span>Contact support</span>
                        <I.arrow />
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://clixa.app/docs"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="s-link"
                      >
                        <span>Documentation</span>
                        <I.external />
                      </a>
                    </li>
                  </ul>
                </SectionCard>
                <SectionCard icon="scroll" title="Legal">
                  <ul className="s-link-list">
                    <li>
                      <a href="#privacy" className="s-link" onClick={onClose}>
                        <span>Privacy policy</span>
                        <I.arrow />
                      </a>
                    </li>
                    <li>
                      <a href="#terms" className="s-link" onClick={onClose}>
                        <span>Terms of service</span>
                        <I.arrow />
                      </a>
                    </li>
                    <li>
                      <a href="#refund" className="s-link" onClick={onClose}>
                        <span>Refund policy</span>
                        <I.arrow />
                      </a>
                    </li>
                  </ul>
                </SectionCard>
              </div>

              {/* ── Danger zone ── */}
              <SectionCard
                icon="alert"
                title="Danger zone"
                subtitle="Irreversible actions. Read carefully before continuing."
                tone="danger"
              >
                <div className="s-danger-row">
                  <div className="s-danger-text">
                    <strong>Reset your data</strong>
                    <p>Wipes thumbnails, optimizations, and personalisation. Your account stays.</p>
                  </div>
                  <button
                    type="button"
                    className="s-btn s-btn--ghost"
                    onClick={() => setDelDataOpen(true)}
                  >
                    Reset data
                  </button>
                </div>
                <div className="s-danger-divider" />
                <div className="s-danger-row">
                  <div className="s-danger-text">
                    <strong>Delete account</strong>
                    <p>Removes your account and every associated record. Cannot be undone.</p>
                  </div>
                  <button
                    type="button"
                    className="s-btn s-btn--danger"
                    onClick={() => setDelAcctOpen(true)}
                  >
                    Delete account
                  </button>
                </div>
              </SectionCard>
            </div>
          </div>

          {/* Confirm sheets */}
          <ConfirmSheet
            open={delDataOpen}
            title="Reset all your data?"
            body="This wipes generated thumbnails, video optimizations, personalisation, and cached settings. Your account remains active."
            danger
            busy={delDataBusy}
            error={delDataError}
            onCancel={() => {
              setDelDataOpen(false)
              setDelDataError('')
              setDelDataConfirm('')
            }}
            onConfirm={handleDeleteData}
            confirmLabel="Yes, reset"
          >
            <div className="s-form">
              <label className="s-field">
                <span className="s-field-label">Type RESET to confirm</span>
                <input
                  type="text"
                  className="s-input"
                  value={delDataConfirm}
                  onChange={(e) => setDelDataConfirm(e.target.value.toUpperCase())}
                  placeholder="RESET"
                  autoComplete="off"
                />
              </label>
            </div>
          </ConfirmSheet>

          <ConfirmSheet
            open={delAcctOpen}
            title="Delete your account?"
            body="This permanently removes your account, channel data, generations, and credits. There is no undo."
            danger
            busy={delAcctBusy}
            error={delAcctError}
            onCancel={() => {
              setDelAcctOpen(false)
              setDelAcctError('')
              setDelAcctConfirm('')
              setDelAcctPw('')
            }}
            onConfirm={handleDeleteAccount}
            confirmLabel="Delete account"
          >
            <div className="s-form">
              <label className="s-field">
                <span className="s-field-label">Type DELETE to confirm</span>
                <input
                  type="text"
                  className="s-input"
                  value={delAcctConfirm}
                  onChange={(e) => setDelAcctConfirm(e.target.value.toUpperCase())}
                  placeholder="DELETE"
                  autoComplete="off"
                />
              </label>
              {!accountDeletePasswordOptional && (
                <label className="s-field">
                  <span className="s-field-label">Password</span>
                  <input
                    type="password"
                    className="s-input"
                    value={delAcctPw}
                    onChange={(e) => setDelAcctPw(e.target.value)}
                    autoComplete="current-password"
                  />
                </label>
              )}
            </div>
          </ConfirmSheet>
        </div>
      </div>
    </div>,
    document.body
  )
}

function greetingFromEmail(email) {
  if (!email) return 'Welcome'
  const handle = email.split('@')[0]
  const cleaned = handle
    .replace(/[._-]+/g, ' ')
    .replace(/\d+/g, '')
    .trim()
  if (!cleaned) return 'Welcome'
  return `Hey, ${cleaned[0].toUpperCase()}${cleaned.slice(1).toLowerCase()}`
}

export default SettingsModal
