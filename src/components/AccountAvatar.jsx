import { useEffect, useState } from 'react'

/**
 * Renders the inner content of an avatar circle.
 *
 * Resolution order:
 *   1. `pictureUrl` — usually the Google profile picture captured from the
 *      OAuth id_token. Sized down to 64px on render. Falls through to step 2
 *      on load error so a broken/expired Google CDN URL doesn't leave a
 *      blank circle.
 *   2. Gravatar — derived from a sha256 of the lowercased email. `d=404`
 *      makes the request fail when no avatar is registered, falling through
 *      to step 3.
 *   3. The user's first initial on the accent-gradient background.
 *
 * The caller provides the wrapper element with size + circular shape (e.g.
 * `<span className="sidebar-account-avatar">`). This component only picks
 * what goes inside, so it drops into any existing avatar slot without
 * disturbing the layout.
 */
export default function AccountAvatar({
  email,
  pictureUrl = null,
  fallbackChar = 'U',
  imgClassName = 'sidebar-account-avatar-img',
  letterClassName = 'sidebar-account-avatar-letter',
}) {
  const [hash, setHash] = useState(null)
  // Two independent error flags so a broken `pictureUrl` falls through to
  // Gravatar, and a 404 Gravatar falls through to the initial.
  const [pictureErrored, setPictureErrored] = useState(false)
  const [gravatarErrored, setGravatarErrored] = useState(false)
  const initial = (email?.[0] || fallbackChar).toUpperCase()

  useEffect(() => {
    setPictureErrored(false)
  }, [pictureUrl])

  useEffect(() => {
    setGravatarErrored(false)
    setHash(null)
    if (!email) return undefined
    // Skip the Gravatar sha256 entirely while a working Google profile
    // photo is being shown — that branch renders first and the hash
    // would never be used. We only need Gravatar once `pictureUrl` is
    // absent or has errored out.
    if (pictureUrl && !pictureErrored) return undefined
    let cancelled = false
    sha256Hex(email.trim().toLowerCase()).then((h) => {
      if (!cancelled) setHash(h)
    })
    return () => {
      cancelled = true
    }
  }, [email, pictureUrl, pictureErrored])

  if (pictureUrl && !pictureErrored) {
    return (
      <img
        src={pictureUrl}
        alt={email || 'avatar'}
        className={imgClassName}
        referrerPolicy="no-referrer"
        onError={() => setPictureErrored(true)}
      />
    )
  }
  if (hash && !gravatarErrored) {
    return (
      <img
        src={`https://www.gravatar.com/avatar/${hash}?s=64&d=404`}
        alt={email || 'avatar'}
        className={imgClassName}
        onError={() => setGravatarErrored(true)}
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
