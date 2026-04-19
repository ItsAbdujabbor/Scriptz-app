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

function normalizeHashRoute(hashValue) {
  return String(hashValue || '')
    .replace(/^#/, '')
    .replace(/^\/+/, '')
    .split('?')[0]
    .trim()
}

function getView() {
  const hash = (typeof window !== 'undefined' && window.location.hash) || ''
  const h = normalizeHashRoute(hash)
  if (h === 'terms' || h === 'terms-of-use' || h === 'terms-of-service') return 'terms'
  if (h === 'privacy' || h === 'privacy-policy') return 'privacy'
  if (h === 'refund' || h === 'refund-policy') return 'refund'
  return 'landing'
}

function App() {
  const [view, setView] = useState(getView)

  useEffect(() => {
    applySavedTheme()
  }, [])

  useEffect(() => {
    const onHashChange = () => setView(getView())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const goBack = () => {
    // Clear the hash and return to the landing page.
    window.history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search
    )
    setView('landing')
  }

  if (view === 'terms') return <Terms onBack={goBack} />
  if (view === 'privacy') return <PrivacyPolicy onBack={goBack} />
  if (view === 'refund') return <RefundPolicy onBack={goBack} />
  return <LandingPage />
}

export default App
