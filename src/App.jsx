import { useState, useEffect, lazy, Suspense } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from './stores/authStore'
import { prefetchHistoryConversations } from './lib/query/prefetchHistoryConversations'
import { AppShellLoading } from './components/AppShellLoading'
import { useOnboardingStore } from './stores/onboardingStore'

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

const LandingPage = lazy(() =>
  import('./landing/LandingPage').then((m) => ({ default: m.LandingPage }))
)
const Login = lazy(() => import('./auth/Login').then((m) => ({ default: m.Login })))
const Signup = lazy(() => import('./auth/Signup').then((m) => ({ default: m.Signup })))
const ForgotPassword = lazy(() =>
  import('./auth/ForgotPassword').then((m) => ({ default: m.ForgotPassword }))
)
const ResetPassword = lazy(() =>
  import('./auth/ResetPassword').then((m) => ({ default: m.ResetPassword }))
)
const Terms = lazy(() => import('./legal/Terms').then((m) => ({ default: m.Terms })))
const PrivacyPolicy = lazy(() =>
  import('./legal/PrivacyPolicy').then((m) => ({ default: m.PrivacyPolicy }))
)
const Onboarding = lazy(() => import('./app/Onboarding').then((m) => ({ default: m.Onboarding })))
const Optimizing = lazy(() => import('./app/Optimizing').then((m) => ({ default: m.Optimizing })))
const PostSignupSplash = lazy(() =>
  import('./app/PostSignupSplash').then((m) => ({ default: m.PostSignupSplash }))
)

/** Dashboard, Coach, Optimize, Pro, Templates — one lazy chunk; in-app navigation does not flash full-screen. */
const AuthenticatedRoutes = lazy(() => import('./AuthenticatedRoutes.jsx'))

const LoadingFallback = () => (
  <div
    style={{
      minHeight: '100vh',
      background: '#060607',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#9ca3af',
      fontFamily: "'Poppins', system-ui, sans-serif",
    }}
  >
    <div
      style={{
        width: 28,
        height: 28,
        border: '3px solid rgba(255,255,255,0.12)',
        borderTopColor: '#a78bfa',
        borderRadius: '50%',
        animation: 'spin 0.9s linear infinite',
      }}
    />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
)

function hashIndicatesPasswordRecovery() {
  if (typeof window === 'undefined') return false
  const frag = window.location.hash.slice(1)
  if (frag.includes('type=recovery')) return true
  try {
    const q = new URLSearchParams(window.location.search)
    if (q.get('type') === 'recovery') return true
  } catch (_) {}
  return false
}

function getView() {
  if (hashIndicatesPasswordRecovery()) return 'reset-password'
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
  if (h === 'library') return 'templates'
  if (h === 'templates') return 'templates'
  if (h === 'app-youtube') return 'dashboard'
  return 'landing'
}

function AuthenticatedRouteBoundary({ view, onLogout }) {
  return (
    <Suspense fallback={<AppShellLoading view={view} onLogout={onLogout} />}>
      <AuthenticatedRoutes view={view} onLogout={onLogout} />
    </Suspense>
  )
}

function App() {
  const [view, setView] = useState(getView)
  const [sessionChecked, setSessionChecked] = useState(false)
  const accessToken = useAuthStore((s) => s.accessToken)
  const loadOnboarding = useOnboardingStore((s) => s.load)
  const queryClient = useQueryClient()

  useEffect(() => {
    applySavedTheme()
  }, [])

  useEffect(() => {
    loadOnboarding()
    useAuthStore
      .getState()
      .ensureSession()
      .then(() => {
        setSessionChecked(true)
        const token = useAuthStore.getState().accessToken
        const completed = useOnboardingStore.getState().onboardingCompleted
        const hash = normalizeHashRoute(window.location.hash || '')
        if (token && !hash) {
          window.location.hash = completed ? 'dashboard' : 'onboarding'
          setView(completed ? 'dashboard' : 'onboarding')
        }
      })
  }, [loadOnboarding])

  useEffect(() => {
    const onHashChange = () => setView(getView())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    if (!sessionChecked || !accessToken) return
    const t = window.setTimeout(() => {
      prefetchHistoryConversations(queryClient).catch(() => {})
    }, 0)
    return () => window.clearTimeout(t)
  }, [sessionChecked, accessToken, queryClient])

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
    const appViews = [
      'onboarding',
      'optimizing',
      'dashboard',
      'coach',
      'optimize',
      'pro',
      'templates',
    ]
    if (appViews.includes(view) && !accessToken) {
      window.location.hash = 'login'
      setView('login')
    }
  }, [view, accessToken, sessionChecked])

  useEffect(() => {
    if (!sessionChecked || !accessToken) return
    if (['login', 'signup', 'forgot-password'].includes(view)) {
      const completed = useOnboardingStore.getState().onboardingCompleted
      window.location.hash = completed ? 'dashboard' : 'onboarding'
      setView(getView())
    }
  }, [sessionChecked, accessToken, view])

  const appViews = [
    'onboarding',
    'optimizing',
    'dashboard',
    'coach',
    'optimize',
    'pro',
    'templates',
  ]
  const needsSessionBeforeRender = appViews.includes(view)
  if (needsSessionBeforeRender && !sessionChecked) {
    if (['dashboard', 'coach', 'optimize', 'pro', 'templates'].includes(view)) {
      return <AppShellLoading view={view} onLogout={onLogout} />
    }
    return <LoadingFallback />
  }
  if (appViews.includes(view) && !accessToken) {
    return null
  }

  const content = (() => {
    switch (view) {
      case 'login':
        return (
          <Login
            onBack={goBack}
            onGoToSignup={goToSignup}
            onGoToForgotPassword={goToForgotPassword}
            onSuccess={onAuthSuccess}
          />
        )
      case 'signup':
        return <Signup onBack={goBack} onGoToLogin={goToLogin} onSuccess={goToSplashAfterSignup} />
      case 'splash-signup':
        return (
          <PostSignupSplash
            onComplete={() => {
              window.location.hash = 'onboarding'
              setView('onboarding')
            }}
          />
        )
      case 'forgot-password':
        return <ForgotPassword onBack={goToLogin} onGoToLogin={goToLogin} />
      case 'reset-password':
        return <ResetPassword onBack={goToLogin} onSuccess={goToLogin} />
      case 'terms':
        return <Terms onBack={goBack} />
      case 'privacy':
        return <PrivacyPolicy onBack={goBack} />
      case 'onboarding':
        return (
          <Onboarding
            onComplete={() => {
              window.location.hash = 'optimizing'
              setView('optimizing')
            }}
          />
        )
      case 'optimizing':
        return (
          <Optimizing
            onComplete={() => {
              window.location.hash = 'dashboard'
              setView('dashboard')
            }}
          />
        )
      case 'dashboard':
        return <AuthenticatedRouteBoundary view="dashboard" onLogout={onLogout} />
      case 'coach':
        return <AuthenticatedRouteBoundary view="coach" onLogout={onLogout} />
      case 'optimize':
        return <AuthenticatedRouteBoundary view="optimize" onLogout={onLogout} />
      case 'pro':
        return <AuthenticatedRouteBoundary view="pro" onLogout={onLogout} />
      case 'templates':
        return <AuthenticatedRouteBoundary view="templates" onLogout={onLogout} />
      default:
        return <LandingPage />
    }
  })()

  return <Suspense fallback={<LoadingFallback />}>{content}</Suspense>
}

export default App
