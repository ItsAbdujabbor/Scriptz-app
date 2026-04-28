/**
 * NotFound — full-screen 404 surface.
 *
 * Rendered standalone at the App.jsx level (NOT inside the authenticated
 * shell) for both signed-in and signed-out users. The CTA navigates via
 * ``window.location.href`` rather than just the hash, because the user
 * may have arrived via a junk pathname (e.g. ``/ioaojsa#dashboard``); a
 * hash-only update would leave that bad path in place and loop here.
 */
import { PrimaryPill } from './ui/PrimaryPill'
import './NotFound.css'

export function NotFound({ isAuthenticated = false, onGoHome }) {
  const target = isAuthenticated ? '/#dashboard' : '/'
  const ctaLabel = isAuthenticated ? 'Back to dashboard' : 'Back to home'

  const goHome = () => {
    if (typeof onGoHome === 'function') {
      onGoHome()
      return
    }
    if (typeof window !== 'undefined') {
      window.location.href = target
    }
  }

  return (
    <div className="notfound-root" role="alert" aria-labelledby="notfound-title">
      <div className="notfound-bg" aria-hidden="true">
        <span className="notfound-bg-blob notfound-bg-blob--a" />
        <span className="notfound-bg-blob notfound-bg-blob--b" />
      </div>
      <div className="notfound-content">
        <span className="notfound-404" aria-hidden="true">404</span>
        <h1 className="notfound-title" id="notfound-title">
          Oops! Screen not found
        </h1>
        <p className="notfound-subtitle">
          The page you&rsquo;re looking for doesn&rsquo;t exist or has moved.
        </p>
        <PrimaryPill label={ctaLabel} onClick={goHome} ariaLabel={ctaLabel} />
      </div>
    </div>
  )
}

export default NotFound
