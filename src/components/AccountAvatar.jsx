import { useEffect, useState } from 'react'

/**
 * Renders the inner content of an avatar circle: a Gravatar `<img>` when one
 * exists for the given email, otherwise the user's first initial.
 *
 * The caller provides the wrapper element with size + circular shape (e.g.
 * `<span className="sidebar-account-avatar">`). This component only chooses
 * what goes inside, so it can drop into any existing avatar slot without
 * disturbing the layout.
 *
 * Gravatar's `d=404` makes the image request fail when no avatar is
 * registered for the hash — `onError` then swaps to the initial fallback.
 */
export default function AccountAvatar({ email, fallbackChar = 'U', imgClassName = 'sidebar-account-avatar-img', letterClassName = 'sidebar-account-avatar-letter' }) {
  const [hash, setHash] = useState(null)
  const [errored, setErrored] = useState(false)
  const initial = (email?.[0] || fallbackChar).toUpperCase()

  useEffect(() => {
    setErrored(false)
    setHash(null)
    if (!email) return
    let cancelled = false
    sha256Hex(email.trim().toLowerCase()).then((h) => {
      if (!cancelled) setHash(h)
    })
    return () => {
      cancelled = true
    }
  }, [email])

  if (hash && !errored) {
    return (
      <img
        src={`https://www.gravatar.com/avatar/${hash}?s=64&d=404`}
        alt={email || 'avatar'}
        className={imgClassName}
        onError={() => setErrored(true)}
      />
    )
  }
  return (
    <span className={letterClassName} aria-hidden>
      {initial}
    </span>
  )
}

async function sha256Hex(input) {
  const buf = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
