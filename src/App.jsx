import { useState, useEffect } from 'react'
import { useAuthStore } from './stores/authStore'

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
import { useOnboardingStore } from './stores/onboardingStore'
import { LandingPage } from './landing/LandingPage'
import { Login } from './auth/Login'
import { Signup } from './auth/Signup'
import { ForgotPassword } from './auth/ForgotPassword'
import { ResetPassword } from './auth/ResetPassword'
import { Terms } from './legal/Terms'
import { PrivacyPolicy } from './legal/PrivacyPolicy'
import { Onboarding } from './app/Onboarding'
import { Optimizing } from './app/Optimizing'
import { Dashboard } from './app/Dashboard'
import { CoachChat } from './app/CoachChat'
import { Optimize } from './app/Optimize'
import { Pro } from './app/Pro'
import { Library } from './app/Library'
import { PostSignupSplash } from './app/PostSignupSplash'

function getView() {
  const hash = (typeof window !== 'undefined' && window.location.hash) || ''
  const h = normalizeHashRoute(hash)
  if (h === 'login') return 'login'
  if (h === 'register' || h === 'signup') return 'signup'
  if (h === 'forgot-password') return 'forgot-password'
  if (h === 'reset-password') return 'reset-password'
  if (h === 'terms') return 'terms'
  if (h === 'privacy') return 'privacy'
  if (h === 'onboarding') return 'onboarding'
  if (h === 'optimizing') return 'optimizing'
  if (h === 'dashboard') return 'dashboard'
  if (h === 'coach' || h.startsWith('coach/')) return 'coach'
  if (h === 'optimize') return 'optimize'
  if (h === 'pro') return 'pro'
  if (h === 'library') return 'library'
  if (h === 'app-youtube') return 'dashboard'
  return 'landing'
}

function App() {
  const [view, setView] = useState(getView)
  const [sessionChecked, setSessionChecked] = useState(false)
  const loadSession = useAuthStore((s) => s.loadSession)
  const accessToken = useAuthStore((s) => s.accessToken)
  const loadOnboarding = useOnboardingStore((s) => s.load)

  useEffect(() => {
    applySavedTheme()
  }, [])

  useEffect(() => {
    loadSession()
    loadOnboarding()
    useAuthStore.getState().ensureSession().then(() => {
      setSessionChecked(true)
      const token = useAuthStore.getState().accessToken
      const completed = useOnboardingStore.getState().onboardingCompleted
      const hash = normalizeHashRoute(window.location.hash || '')
      if (token && !hash) {
        window.location.hash = completed ? 'dashboard' : 'onboarding'
        setView(completed ? 'dashboard' : 'onboarding')
      }
    })
  }, [loadSession, loadOnboarding])

  useEffect(() => {
    const onHashChange = () => setView(getView())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const goBack = () => {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    setView('landing')
  }
  const goToLogin = () => {
    window.location.hash = 'login'
    setView('login')
  }
  const goToSignup = () => {
    window.location.hash = 'register'
    setView('signup')
  }
  const goToSplashAfterSignup = () => {
    setView('splash-signup')
  }
  const goToForgotPassword = () => {
    window.location.hash = 'forgot-password'
    setView('forgot-password')
  }
  const onAuthSuccess = () => {
    useOnboardingStore.getState().load()
    const completed = useOnboardingStore.getState().onboardingCompleted
    window.location.hash = completed ? 'dashboard' : 'onboarding'
    setView(getView())
  }
  const onLogout = () => {
    window.location.hash = ''
    setView('landing')
  }

  useEffect(() => {
    if (!sessionChecked) return
    const appViews = ['onboarding', 'optimizing', 'dashboard', 'coach', 'optimize', 'pro', 'library']
    if (appViews.includes(view) && !accessToken) {
      window.location.hash = 'login'
      setView('login')
    }
  }, [view, accessToken, sessionChecked])

  const appViews = ['onboarding', 'optimizing', 'dashboard', 'coach', 'optimize', 'pro', 'library']
  if (!sessionChecked) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#060607',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#9ca3af',
        fontFamily: 'Inter, sans-serif',
      }}>
        <div style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,0.12)', borderTopColor: '#a78bfa', borderRadius: '50%', animation: 'spin 0.9s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }
  if (appViews.includes(view) && !accessToken) {
    return null
  }

  if (view === 'login') {
    return (
      <Login
        onBack={goBack}
        onGoToSignup={goToSignup}
        onGoToForgotPassword={goToForgotPassword}
        onSuccess={onAuthSuccess}
      />
    )
  }
  if (view === 'signup') {
    return (
      <Signup
        onBack={goBack}
        onGoToLogin={goToLogin}
        onSuccess={goToSplashAfterSignup}
      />
    )
  }
  if (view === 'splash-signup') {
    return (
      <PostSignupSplash
        onComplete={() => {
          window.location.hash = 'onboarding'
          setView('onboarding')
        }}
      />
    )
  }
  if (view === 'forgot-password') {
    return (
      <ForgotPassword
        onBack={goToLogin}
        onGoToLogin={goToLogin}
      />
    )
  }
  if (view === 'reset-password') {
    return (
      <ResetPassword
        onBack={goToLogin}
        onSuccess={goToLogin}
      />
    )
  }
  if (view === 'terms') {
    return <Terms onBack={goBack} />
  }
  if (view === 'privacy') {
    return <PrivacyPolicy onBack={goBack} />
  }
  if (view === 'onboarding') {
    return (
      <Onboarding
        onComplete={() => {
          window.location.hash = 'optimizing'
          setView('optimizing')
        }}
      />
    )
  }
  if (view === 'optimizing') {
    return (
      <Optimizing
        onComplete={() => {
          window.location.hash = 'dashboard'
          setView('dashboard')
        }}
      />
    )
  }
  if (view === 'dashboard') {
    return <Dashboard onLogout={onLogout} />
  }
  if (view === 'coach') {
    return <CoachChat onLogout={onLogout} />
  }
  if (view === 'optimize') {
    return <Optimize onLogout={onLogout} />
  }
  if (view === 'pro') {
    return <Pro onLogout={onLogout} />
  }
  if (view === 'library') {
    return <Library onLogout={onLogout} />
  }
  return <LandingPage />
}

export default App
