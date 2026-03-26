import { useCallback, useRef, useState } from 'react'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const BREVO_CONTACTS = 'https://api.brevo.com/v3/contacts'

function brevoContactsUrl() {
  // Dev: Vite proxy avoids browser CORS to api.brevo.com. Production: direct (may fail CORS; use a tiny proxy if needed).
  return import.meta.env.DEV ? '/brevo-api/v3/contacts' : BREVO_CONTACTS
}

function parseBrevoListId(raw) {
  if (raw == null || raw === '') return null
  const n = Number.parseInt(String(raw), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Waitlist: validates email (lowercase), honeypot.
 * Subscribes via Brevo when `VITE_BREVO_API_KEY` + `VITE_BREVO_LIST_ID` are set (frontend-only).
 * Falls back to `VITE_WAITLIST_POST_URL` if Brevo is not configured.
 *
 * Note: shipping a full API key in the client exposes it in the bundle; prefer a server or
 * serverless proxy for production if the key must stay secret.
 */
export function WaitlistForm({ id = 'waitlist', className = '' }) {
  const brevoKey = (import.meta.env.VITE_BREVO_API_KEY || '').trim()
  const brevoListId = parseBrevoListId(import.meta.env.VITE_BREVO_LIST_ID)
  const hasBrevo = Boolean(brevoKey && brevoListId != null)

  const postUrl = (import.meta.env.VITE_WAITLIST_POST_URL || '').trim()

  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('idle')
  const hpRef = useRef(null)

  const normalize = useCallback((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''), [])

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if ((hpRef.current?.value || '').trim()) {
      setStatus('success')
      return
    }

    const em = normalize(email)
    if (!em) {
      setError('Please enter your email address.')
      return
    }
    if (!EMAIL_RE.test(em)) {
      setError('Please enter a valid email address.')
      return
    }

    if (!hasBrevo && !postUrl) {
      setStatus('success')
      return
    }

    setStatus('loading')
    try {
      if (hasBrevo) {
        const res = await fetch(brevoContactsUrl(), {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'api-key': brevoKey,
          },
          body: JSON.stringify({
            email: em,
            listIds: [brevoListId],
            updateEnabled: true,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          const msg =
            (typeof data?.message === 'string' && data.message) ||
            `Could not join the list (${res.status}).`
          setError(msg)
          setStatus('idle')
          return
        }
        setStatus('success')
        return
      }

      const res = await fetch(postUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: em }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          data?.error?.message ||
          data?.message ||
          (typeof data?.detail === 'string' ? data.detail : null) ||
          'Could not submit. Try again later.'
        setError(msg)
        setStatus('idle')
        return
      }
      setStatus('success')
    } catch {
      setError(
        'Network error. If this persists, the form may be blocked by the browser (CORS). Try from the dev server or add a small proxy.',
      )
      setStatus('idle')
    }
  }

  const busy = status === 'loading' || status === 'success'
  const submitted = hasBrevo || postUrl

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
            placeholder="you@example.com"
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmail((v) => normalize(v))}
            disabled={busy}
            aria-invalid={!!error}
            aria-describedby={error ? 'lin-waitlist-err' : 'lin-waitlist-fineprint'}
          />
          <button type="submit" className="lin-waitlist-join" disabled={busy}>
            {status === 'loading' ? 'Joining…' : status === 'success' ? 'Joined' : 'Join'}
          </button>
        </div>
        {error ? (
          <p id="lin-waitlist-err" className="lin-waitlist-msg lin-waitlist-msg--err" role="alert">
            {error}
          </p>
        ) : null}
        {status === 'success' ? (
          <p className="lin-waitlist-msg lin-waitlist-msg--ok" role="status">
            {submitted
              ? 'You’re on the list. We’ll email you when invites open.'
              : 'Thanks — we’ll be in touch when Scriptz opens.'}
          </p>
        ) : null}
        <p id="lin-waitlist-fineprint" className="lin-waitlist-fineprint">
          We’ll only use your email for Scriptz launch updates. Unsubscribe anytime.
        </p>
      </form>
    </div>
  )
}
