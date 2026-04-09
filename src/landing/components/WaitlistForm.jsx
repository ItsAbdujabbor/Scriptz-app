import { useCallback, useRef, useState } from 'react'

/** Lenient check — accepts international emails (IDN, unicode). Full validation on server. */
function isPlausibleEmail(s) {
  const t = typeof s === 'string' ? s.trim() : ''
  if (t.length < 3 || t.length > 320) return false
  const at = t.lastIndexOf('@')
  if (at <= 0) return false
  const local = t.slice(0, at)
  const domain = t.slice(at + 1)
  if (!local.length || local.length > 64) return false
  if (!domain.length || domain.length > 253) return false
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) return false
  // Domain must have at least one dot (e.g. gmail.com, mail.co.uk, почта.рф)
  if (!domain.includes('.')) return false
  return true
}

/** Lowercase domain only (RFC allows case-sensitive local part; Brevo accepts normalized input). */
function normalizeEmailForSubmit(raw) {
  const t = typeof raw === 'string' ? raw.trim() : ''
  const at = t.lastIndexOf('@')
  if (at <= 0) return t
  return t.slice(0, at + 1) + t.slice(at + 1).toLowerCase()
}

function getApiBaseUrl() {
  const env = import.meta.env
  if (env.DEV) return ''
  const explicit = env.VITE_API_BASE_URL
  return explicit && String(explicit).trim() !== ''
    ? String(explicit).trim()
    : 'http://localhost:8000'
}

/**
 * Landing waitlist — POSTs to Scriptz API `/api/waitlist`, which adds the contact in Brevo.
 * The API key stays on the server so Brevo authorised IPs can list only your server while anyone worldwide can sign up.
 */
export function WaitlistForm({ id = 'waitlist', className = '' }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('idle')
  const hpRef = useRef(null)

  const normalize = useCallback((v) => (typeof v === 'string' ? v.trim() : ''), [])

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if ((hpRef.current?.value || '').trim()) {
      setStatus('success')
      return
    }

    const em = normalizeEmailForSubmit(email)
    if (!em) {
      setError('Please enter your email address.')
      return
    }
    if (!isPlausibleEmail(em)) {
      setError('Please enter a valid email address.')
      return
    }

    setStatus('loading')
    try {
      const base = getApiBaseUrl()
      const res = await fetch(`${base}/api/waitlist`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: em }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          (data && data.error && data.error.message) ||
          (typeof data?.detail === 'string' ? data.detail : null) ||
          `Could not join the list (${res.status}).`
        setError(msg)
        setStatus('idle')
        return
      }
      setStatus('success')
    } catch {
      setError('Network error. Check your connection and that the API is running.')
      setStatus('idle')
    }
  }

  const busy = status === 'loading' || status === 'success'

  return (
    <div className={`lin-waitlist ${className}`.trim()} id={id}>
      <form className="lin-waitlist-form" onSubmit={onSubmit} noValidate>
        <div className="lin-hp" aria-hidden="true">
          <label htmlFor="lin-waitlist-hp">Company website</label>
          <input
            ref={hpRef}
            type="text"
            id="lin-waitlist-hp"
            name="website"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>
        <div className="lin-waitlist-combo">
          <input
            type="email"
            name="email"
            className="lin-waitlist-input"
            placeholder="Enter your email"
            autoComplete="email"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmail((v) => normalize(v))}
            disabled={busy}
            aria-invalid={!!error}
            aria-describedby={error ? 'lin-waitlist-err' : 'lin-waitlist-fineprint'}
          />
          <button type="submit" className="lin-waitlist-join" disabled={busy}>
            {status === 'loading' ? 'Joining…' : status === 'success' ? 'You\'re in!' : 'Join the waitlist'}
          </button>
        </div>
        {error ? (
          <p id="lin-waitlist-err" className="lin-waitlist-msg lin-waitlist-msg--err" role="alert">
            {error}
          </p>
        ) : null}
        {status === 'success' ? (
          <p className="lin-waitlist-msg lin-waitlist-msg--ok" role="status">
            You’re on the list. We’ll email you when invites open.
          </p>
        ) : null}
        <p id="lin-waitlist-fineprint" className="lin-waitlist-fineprint">
          No spam — only launch updates. Unsubscribe anytime.
        </p>
      </form>
    </div>
  )
}
