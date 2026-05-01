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

/** Dashboard, Optimize, Pro, Billing — one lazy chunk; in-app navigation does not flash full-screen. */
const AuthenticatedRoutes = lazy(() => import('./AuthenticatedRoutes.jsx'))

/** 404 — a standalone full-screen surface, rendered without the app
 *  shell so the sidebar / topbar don't appear over a route the user
 *  was never supposed to be on. Lazy because most users never see it. */
const NotFound = lazy(() => import('./components/NotFound').then((m) => ({ default: m.NotFound })))

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

/**
 * The app is hash-routed and served from ``/``. Any other URL pathname
 * is junk — typed-wrong URL, a stale share-link with a path component,
 * or a search-engine landing on a misindexed URL. SPA fallback (Vite
 * dev + the FastAPI ``FrontendMiddleware`` in prod) will serve
 * ``index.html`` for any unknown path, so without a pathname check the
 * user sees a fully-rendered app at e.g. ``/ioaojsa#dashboard`` —
 * confusing because the app rendered the dashboard for a URL that
 * shouldn't have worked.
 *
 * Accept ``/`` and ``/index.html``; treat everything else as 404.
 * Trailing slashes get normalised so ``//`` is fine.
 */
function pathIsValid() {
  if (typeof window === 'undefined') return true
  const path = (window.location.pathname || '/').replace(/\/+$/, '') || '/'
  return path === '/' || path === '/index.html'
}

function getView() {
  if (hashIndicatesPasswordRecovery()) return 'reset-password'
  // Reject obviously-bad URL paths *before* parsing the hash. Without
  // this, ``/ioaojsa#dashboard`` would render the dashboard (the hash
  // is valid) — the user would never know the path was wrong.
  if (!pathIsValid()) return 'not-found'
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
  // Dashboard / Optimize / Pro / Billing screens are temporarily hidden —
  // the only authenticated app surface right now is the thumbnail
  // generator. Any legacy hash that used to land on one of those screens
  // (or onboarding / optimizing / app-youtube) silently redirects to
  // thumbnails so old bookmarks and deep-links still resolve.
  if (h === 'onboarding') return 'thumbnails'
  if (h === 'optimizing') return 'thumbnails'
  if (h === 'dashboard') return 'thumbnails'
  if (h === 'optimize') return 'thumbnails'
  if (h === 'billing') return 'thumbnails'
  if (h === 'app-youtube') return 'thumbnails'
  // Pro upgrade screen stays reachable — the "Go Pro" CTA in the sidebar
  // depends on it.
  if (h === 'pro') return 'pro'
  if (h === 'thumbnails' || h.startsWith('thumbnails/') || h.startsWith('thumbnails?'))
    return 'thumbnails'
  // Settings is now an in-shell route (not a modal/dialog) so it shares
  // the sidebar + main content layout with every other authenticated view.
  if (h === 'settings' || h.startsWith('settings/') || h.startsWith('settings?')) return 'settings'
  // Empty hash = "no specific route, show the marketing landing page".
  // Anything non-empty that didn't match above = the user typed/clicked
  // a URL we don't have a screen for. Return 'not-found' so the
  // authenticated user sees the 404 component (and the unauthenticated
  // path still falls back to landing — see the switch in App).
  if (h === '') return 'landing'
  return 'not-found'
}

// Kick off the inner view's chunk *in parallel* with the AuthenticatedRoutes
// shell. We can't go through `lazyViews.js` here — it's statically imported
// by AuthenticatedRoutes/Sidebar so it lives in the shell chunk, which means
// going through it would waterfall. Direct dynamic imports start the inner
// chunks in the same browser request batch as the shell. Fire-and-forget;
// errors surface through the Suspense fallback if the network fails.
const VIEW_CHUNK_PREFETCH = {
  thumbnails: () => import('./app/Thumbnails'),
  pro: () => import('./app/Pro'),
  // Dashboard / Optimize / Billing prefetches removed — those screens
  // are hidden right now (see getView() redirects).
}

function AuthenticatedRouteBoundary({ view, onLogout }) {
  if (typeof window !== 'undefined') {
    const fn = VIEW_CHUNK_PREFETCH[view]
    if (fn) fn().catch(() => {})
  }
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
          window.location.hash = 'thumbnails'
          setView('thumbnails')
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
    window.location.hash = 'thumbnails'
    setView('thumbnails')
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
    window.location.hash = 'thumbnails'
    setView('thumbnails')
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
    const appViews = ['thumbnails', 'pro', 'settings']
    if (appViews.includes(view) && !accessToken) {
      window.location.hash = 'login'
      setView('login')
    }
  }, [view, accessToken, sessionChecked])

  useEffect(() => {
    if (!sessionChecked || !accessToken) return
    if (useAuthStore.getState().user?.role === 'banned') return
    if (['login', 'signup', 'forgot-password'].includes(view)) {
      window.location.hash = 'thumbnails'
      setView('thumbnails')
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

  const appViews = ['dashboard', 'thumbnails', 'optimize', 'pro', 'billing']
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
      case 'thumbnails':
        return <AuthenticatedRouteBoundary view="thumbnails" onLogout={onLogout} />
      case 'pro':
        return <AuthenticatedRouteBoundary view="pro" onLogout={onLogout} />
      case 'settings':
        return <AuthenticatedRouteBoundary view="settings" onLogout={onLogout} />
      case 'not-found':
        // Full-screen standalone — NOT wrapped in AuthenticatedRouteBoundary.
        // The user is on a route that doesn't exist; surrounding it with
        // the app shell (sidebar, topbar) implies "you're somewhere in
        // the app" which is misleading. Both authenticated and anonymous
        // users see the same screen — the only difference is where the
        // recovery CTA sends them (dashboard vs landing).
        return <NotFound isAuthenticated={!!accessToken} />
      default:
        return <LandingPage />
    }
  })()

  return <Suspense fallback={<LoadingFallback />}>{content}</Suspense>
}

export default App
