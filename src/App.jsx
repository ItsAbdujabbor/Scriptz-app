import { useState, useEffect } from 'react'
import { LandingPage } from './landing/LandingPage'
import { Terms } from './legal/Terms'
import { PrivacyPolicy } from './legal/PrivacyPolicy'
import { RefundPolicy } from './legal/RefundPolicy'

const THEME_KEY = 'scriptz_theme'

function applySavedTheme() {
  try {
    const theme = localStorage.getItem(THEME_KEY) || 'dark'
    document.body.classList.toggle('theme-light', theme === 'light')
  } catch (_) {}
}

function normalizeRoute(value) {
  return String(value || '')
    .replace(/^#/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .split('?')[0]
    .split('#')[0]
    .trim()
    .toLowerCase()
}

/**
 * getView reads both the pathname ("/refund-policy") and the hash
 * ("#refund-policy") so Paddle-style URLs with or without the hash
 * resolve to the same legal page. S3 + CloudFront is configured with
 * a 403/404 → /index.html fallback, so any clean path lands here and
 * we route on the client.
 */
function getView() {
  if (typeof window === 'undefined') return 'landing'
  const path = normalizeRoute(window.location.pathname)
  const hash = normalizeRoute(window.location.hash)
  const route = path || hash
  if (route === 'terms' || route === 'terms-of-use' || route === 'terms-of-service') return 'terms'
  if (route === 'privacy' || route === 'privacy-policy') return 'privacy'
  if (route === 'refund' || route === 'refund-policy') return 'refund'
  return 'landing'
}

function App() {
  const [view, setView] = useState(getView)

  useEffect(() => {
    applySavedTheme()
  }, [])

  useEffect(() => {
    const onNav = () => setView(getView())
    window.addEventListener('hashchange', onNav)
    window.addEventListener('popstate', onNav)
    return () => {
      window.removeEventListener('hashchange', onNav)
      window.removeEventListener('popstate', onNav)
    }
  }, [])

  const goBack = () => {
    // Strip both pathname and hash so we return to the plain landing URL
    // regardless of whether the user entered via `/refund-policy` or
    // `#refund-policy`.
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', '/' + window.location.search)
    }
    setView('landing')
  }

  if (view === 'terms') return <Terms onBack={goBack} />
  if (view === 'privacy') return <PrivacyPolicy onBack={goBack} />
  if (view === 'refund') return <RefundPolicy onBack={goBack} />
  return <LandingPage />
}

export default App
