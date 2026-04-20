import { useState, useEffect, useLayoutEffect, lazy, Suspense } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from './stores/authStore'
import { BannedScreen } from './auth/BannedScreen'
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
const RefundPolicy = lazy(() =>
  import('./legal/RefundPolicy').then((m) => ({ default: m.RefundPolicy }))
)

/** Dashboard, Optimize, Pro, Billing, A/B Testing — one lazy chunk; in-app navigation does not flash full-screen. */
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
  if (h === 'banned') return 'banned'
  if (h === 'login') return 'login'
  if (h === 'register' || h === 'signup') return 'signup'
  if (h === 'forgot-password') return 'forgot-password'
  if (h === 'reset-password') return 'reset-password'
  if (h === 'terms') return 'terms'
  if (h === 'privacy') return 'privacy'
  if (h === 'refund') return 'refund'
  if (h === 'onboarding') return 'dashboard'
  if (h === 'optimizing') return 'dashboard'
  if (h === 'dashboard') return 'dashboard'
  if (h === 'thumbnails' || h.startsWith('thumbnails/') || h.startsWith('thumbnails?'))
    return 'thumbnails'
  if (h === 'optimize') return 'optimize'
  if (h === 'pro') return 'pro'
  if (h === 'ab-testing' || h.startsWith('ab-testing/')) return 'ab-testing'
  if (h === 'billing') return 'billing'
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
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const queryClient = useQueryClient()

  useEffect(() => {
    applySavedTheme()
  }, [])

  useEffect(() => {
    useOnboardingStore.getState().load()
    useAuthStore
      .getState()
      .ensureSession()
      .then(() => {
        setSessionChecked(true)
        const st = useAuthStore.getState()
        const token = st.accessToken
        const hash = normalizeHashRoute(window.location.hash || '')
        if (token && st.user?.role === 'banned') {
          if (hash !== 'banned') {
            window.location.hash = 'banned'
          }
          setView('banned')
          return
        }
        if (token && !hash) {
          window.location.hash = 'dashboard'
          setView('dashboard')
        }
      })
  }, [])

  useEffect(() => {
    const onHashChange = () => setView(getView())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    if (!sessionChecked || !accessToken) return
    if (useAuthStore.getState().user?.role === 'banned') return
    const t = window.setTimeout(() => {
      prefetchHistoryConversations(queryClient).catch(() => {})
    }, 0)
    return () => window.clearTimeout(t)
  }, [sessionChecked, accessToken, queryClient])

  useEffect(() => {
    if (!sessionChecked) return
    if (view === 'banned' && !accessToken) {
      window.location.hash = 'login'
      setView('login')
    }
  }, [sessionChecked, view, accessToken])

  useEffect(() => {
    if (!sessionChecked || !accessToken || user?.role !== 'banned') return
    const allowed = [
      'banned',
      'login',
      'signup',
      'forgot-password',
      'reset-password',
      'terms',
      'privacy',
      'refund',
    ]
    if (!allowed.includes(view)) {
      window.location.hash = 'banned'
      setView('banned')
    }
  }, [sessionChecked, accessToken, user?.role, view])

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
  const goToDashboardAfterSignup = () => {
    window.location.hash = 'dashboard'
    setView('dashboard')
  }
  const goToForgotPassword = () => {
    window.location.hash = 'forgot-password'
    setView('forgot-password')
  }
  const onAuthSuccess = () => {
    if (useAuthStore.getState().user?.role === 'banned') {
      window.location.hash = 'banned'
      setView('banned')
      return
    }
    useOnboardingStore.getState().load()
    window.location.hash = 'dashboard'
    setView('dashboard')
  }
  const onLogout = async () => {
    // Actually clear the session — tokens, user, cached queries — before
    // navigating. Previously we only changed the hash, so the user stayed
    // logged in and the "authenticated" redirect loop (line 227) bounced
    // them right back to dashboard.
    try {
      await logout()
    } catch {
      /* ignore — still navigate away */
    }
    window.location.hash = 'login'
    setView('login')
  }

  useEffect(() => {
    if (!sessionChecked) return
    const appViews = ['dashboard', 'thumbnails', 'optimize', 'pro', 'ab-testing', 'billing']
    if (appViews.includes(view) && !accessToken) {
      window.location.hash = 'login'
      setView('login')
    }
  }, [view, accessToken, sessionChecked])

  useEffect(() => {
    if (!sessionChecked || !accessToken) return
    if (useAuthStore.getState().user?.role === 'banned') return
    if (['login', 'signup', 'forgot-password'].includes(view)) {
      window.location.hash = 'dashboard'
      setView('dashboard')
    }
  }, [sessionChecked, accessToken, view])

  useLayoutEffect(() => {
    if (!accessToken || user?.role !== 'banned') return
    if (normalizeHashRoute(window.location.hash || '') !== 'banned') {
      window.location.hash = 'banned'
    }
  }, [accessToken, user?.role])

  /** Never mount dashboard / coach / etc. while banned (avoids shell flash). */
  const isBannedUser = Boolean(accessToken && user?.role === 'banned')
  if (isBannedUser) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <BannedScreen
          email={user?.email}
          banDate={user?.ban_date}
          reason={user?.ban_reason}
          onLogout={async () => {
            await logout()
            onLogout()
          }}
        />
      </Suspense>
    )
  }

  const appViews = ['dashboard', 'thumbnails', 'optimize', 'pro', 'ab-testing', 'billing']
  const needsSessionBeforeRender = appViews.includes(view)
  if (needsSessionBeforeRender && !sessionChecked) {
    return <AppShellLoading view={view} onLogout={onLogout} />
  }
  if (appViews.includes(view) && !accessToken) {
    return null
  }

  const content = (() => {
    switch (view) {
      case 'banned':
        return (
          <BannedScreen
            email={user?.email}
            banDate={user?.ban_date}
            reason={user?.ban_reason}
            onLogout={async () => {
              await logout()
              onLogout()
            }}
          />
        )
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
        return (
          <Signup onBack={goBack} onGoToLogin={goToLogin} onSuccess={goToDashboardAfterSignup} />
        )
      case 'forgot-password':
        return <ForgotPassword onBack={goToLogin} onGoToLogin={goToLogin} />
      case 'reset-password':
        return <ResetPassword onBack={goToLogin} onSuccess={goToLogin} />
      case 'terms':
        return <Terms onBack={goBack} />
      case 'privacy':
        return <PrivacyPolicy onBack={goBack} />
      case 'refund':
        return <RefundPolicy onBack={goBack} />
      case 'dashboard':
        return <AuthenticatedRouteBoundary view="dashboard" onLogout={onLogout} />
      case 'thumbnails':
        return <AuthenticatedRouteBoundary view="thumbnails" onLogout={onLogout} />
      case 'optimize':
        return <AuthenticatedRouteBoundary view="optimize" onLogout={onLogout} />
      case 'pro':
        return <AuthenticatedRouteBoundary view="pro" onLogout={onLogout} />
      case 'ab-testing':
        return <AuthenticatedRouteBoundary view="ab-testing" onLogout={onLogout} />
      case 'billing':
        return <AuthenticatedRouteBoundary view="billing" onLogout={onLogout} />
      default:
        return <LandingPage />
    }
  })()

  return <Suspense fallback={<LoadingFallback />}>{content}</Suspense>
}

export default App
