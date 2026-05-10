import { useState, useEffect, useLayoutEffect, lazy, Suspense } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from './stores/authStore'
import { BannedScreen } from './auth/BannedScreen'
// Login + Signup are eager imports — see comment by the lazy block below.
import { Login } from './auth/Login'
import { Signup } from './auth/Signup'
import { AuthSuccessSplash } from './auth/AuthSuccessSplash'
import { prefetchHistoryConversations } from './lib/query/prefetchHistoryConversations'
import { prefetchSubscription, seedSubscriptionFromCache } from './lib/query/prefetchSubscription'
import { AppShellLoading } from './components/AppShellLoading'
import { Splash } from './components/Splash'
import { useOnboardingStore } from './stores/onboardingStore'

const THEME_KEY = 'clixa_theme'
const LEGACY_THEME_KEY = 'scriptz_theme'
function applySavedTheme() {
  try {
    // One-shot migration from the legacy "scriptz_*" brand key.
    let theme = localStorage.getItem(THEME_KEY)
    if (!theme) {
      const legacy = localStorage.getItem(LEGACY_THEME_KEY)
      if (legacy) {
        localStorage.setItem(THEME_KEY, legacy)
        theme = legacy
      }
      localStorage.removeItem(LEGACY_THEME_KEY)
    }
    document.body.classList.toggle('theme-light', (theme || 'dark') === 'light')
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
// Login + Signup are eager imports at the top of this file. Lazy-loading
// them caused a flash + delay when the user clicked Log In / Sign Up on
// the landing page — the dialog should appear instantly with no loader.
const Terms = lazy(() => import('./legal/Terms').then((m) => ({ default: m.Terms })))
const PrivacyPolicy = lazy(() =>
  import('./legal/PrivacyPolicy').then((m) => ({ default: m.PrivacyPolicy }))
)
const RefundPolicy = lazy(() =>
  import('./legal/RefundPolicy').then((m) => ({ default: m.RefundPolicy }))
)

/** Dashboard, Optimize, Billing — one lazy chunk; in-app navigation does not flash full-screen. */
const AuthenticatedRoutes = lazy(() => import('./AuthenticatedRoutes.jsx'))

/** Pro pricing — its own fullscreen takeover, NOT mounted inside the
 *  authenticated shell. A close-X in the top-right dismisses it back to
 *  wherever the user came from. */
const ProScreen = lazy(() => import('./app/ProScreen').then((m) => ({ default: m.ProScreen })))

/** Checkout — Stripe-style fullscreen takeover that hosts the Paddle
 *  Inline Checkout iframe. Reached from the pricing page after the
 *  user picks a plan. Lazy because it pulls in Paddle.js. */
const CheckoutScreen = lazy(() =>
  import('./app/CheckoutScreen').then((m) => ({ default: m.CheckoutScreen }))
)

/** 404 — a standalone full-screen surface, rendered without the app
 *  shell so the sidebar / topbar don't appear over a route the user
 *  was never supposed to be on. Lazy because most users never see it. */
const NotFound = lazy(() => import('./components/NotFound').then((m) => ({ default: m.NotFound })))

/** Detect OAuth callback (?code= on the URL). When this is true on app
 *  mount we render the loader instead of letting the landing page flash
 *  for the ~300ms it takes to exchange the code with the backend. */
function urlIsOAuthCallback() {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('code')
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
  // Reject obviously-bad URL paths *before* parsing the hash. Without
  // this, ``/ioaojsa#dashboard`` would render the dashboard (the hash
  // is valid) — the user would never know the path was wrong.
  if (!pathIsValid()) return 'not-found'
  const hash = (typeof window !== 'undefined' && window.location.hash) || ''
  const h = normalizeHashRoute(hash)
  if (h === 'banned') return 'banned'
  if (h === 'login') return 'login'
  if (h === 'register' || h === 'signup') return 'signup'
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
  // `#billing` keeps a deep-link target but resolves to the thumbnail
  // shell — the actual billing surface is a centred dialog that the
  // shell's `<BillingDialog>` opens via an effect on mount when the
  // hash matches.
  if (h === 'billing') return 'thumbnails'
  if (h === 'app-youtube') return 'thumbnails'
  // Pro upgrade screen stays reachable — the "Go Pro" CTA in the sidebar
  // depends on it.
  if (h === 'pro') return 'pro'
  // Checkout takeover — only reachable after the pricing page hands off a
  // session. The CheckoutScreen itself bounces back to #pro if no session
  // is present, so a deep-link here is harmless.
  if (h === 'checkout') return 'checkout'
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
  // 'pro' is routed at the App.jsx level via <ProScreen> (fullscreen
  // takeover, not an in-shell view) so it doesn't need shell-level
  // chunk prefetch. Dashboard / Optimize / Billing prefetches removed
  // — those screens are hidden right now (see getView() redirects).
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
  // True only on the very first paint after returning from an OAuth IdP
  // (the URL has `?code=…`). Cleared once ensureSession resolves so the
  // landing page can render afterwards if the exchange somehow failed.
  const [oauthCallbackPending, setOauthCallbackPending] = useState(urlIsOAuthCallback)
  // Auth-dialog mode lock. When the user opens the auth dialog from the
  // landing page (or from any other non-auth screen), capture whether
  // they meant Sign in or Sign up and KEEP THAT until the dialog
  // actually closes. While the dialog is open, hash changes between
  // `#login` and `#register` (whether from a deep-link, a stray
  // navigation effect, or the sign-in CTA inside the dialog mid-OAuth)
  // do NOT swap the dialog body — the user said "if I'm registering,
  // stay on register." Only `goBack` (close X) or successful auth can
  // dismiss it; reopening from a closed state captures fresh.
  //
  // On OAuth callback mount (page came back from Google with `?code=`)
  // we prime the lock from `clixa_oauth_intent` in sessionStorage so
  // the same dialog re-mounts (in loading state) — the user perceives
  // the dialog as having "stayed open" through the round-trip.
  const [lockedAuthMode, setLockedAuthMode] = useState(() => {
    const v = getView()
    if (v === 'login' || v === 'signup') return v
    if (urlIsOAuthCallback()) {
      try {
        const intent = sessionStorage.getItem('clixa_oauth_intent')
        if (intent === 'login' || intent === 'signup') return intent
      } catch {
        /* sessionStorage unavailable — fall through */
      }
    }
    return null
  })
  // Briefly show a centered "Welcome back" / "Welcome to Clixa" screen
  // after auth lands but BEFORE we route to thumbnails. Mode is the
  // locked auth mode at the moment auth succeeded so the headline
  // matches what the user just did. `null` = not showing.
  const [welcomeMode, setWelcomeMode] = useState(null)
  const accessToken = useAuthStore((s) => s.accessToken)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const queryClient = useQueryClient()

  useEffect(() => {
    applySavedTheme()
  }, [])

  // Seed React Query's subscription cache from localStorage as early
  // as possible. Runs sync before paint so any component reading
  // `useSubscriptionQuery()` (Sidebar, ThumbnailGenerator, badges)
  // sees the cached Pro tier on the very first render — no
  // "Free → Pro" flash. The async `prefetchSubscription` below
  // revalidates from the server right after `ensureSession` resolves.
  useLayoutEffect(() => {
    seedSubscriptionFromCache(queryClient)
  }, [queryClient])

  useEffect(() => {
    useOnboardingStore.getState().load()
    useAuthStore
      .getState()
      .ensureSession()
      .then(() => {
        setSessionChecked(true)
        setOauthCallbackPending(false)
        const st = useAuthStore.getState()
        const token = st.accessToken
        const hash = normalizeHashRoute(window.location.hash || '')
        // Kick off the subscription network revalidation the moment
        // auth is settled. This happens IN PARALLEL with the route
        // flip below, so by the time Sidebar / ThumbnailGenerator
        // mount, the fresh subscription is either already in cache
        // (cache hit on the localStorage seed) or about to land
        // within ~100ms of the network request.
        if (token && st.user?.role !== 'banned') {
          prefetchSubscription(queryClient).catch(() => {})
        }
        if (token && st.user?.role === 'banned') {
          if (hash !== 'banned') {
            window.location.hash = 'banned'
          }
          setView('banned')
          return
        }
        if (token && !hash) {
          // Skip the direct route when the user came from the auth
          // dialog (OAuth callback OR a regular dialog open that
          // primed `lockedAuthMode`). The welcome-splash effect
          // further down needs a chance to fire so the user sees
          // the "Welcome back" / "Welcome to Clixa" handoff instead
          // of jumping straight to the thumbnail screen. Returning
          // users with a saved session (no dialog open, no callback)
          // keep the original fast path.
          if (lockedAuthMode == null) {
            window.location.hash = 'thumbnails'
            setView('thumbnails')
          }
        }
      })
      .catch(() => {
        setSessionChecked(true)
        setOauthCallbackPending(false)
      })
    // queryClient is stable across renders (single instance from
    // QueryClientProvider) so listing it as a dep won't cause
    // re-runs; it just keeps eslint-react-hooks happy.
  }, [queryClient])

  useEffect(() => {
    const onHashChange = () => setView(getView())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Track when the auth dialog opens / closes so we can lock the mode
  // it was opened in. Transitions:
  //   * (any non-auth view) → 'login' or 'signup'  ⇒ lock to that mode
  //   * 'login'/'signup' → (any non-auth view)     ⇒ release the lock
  //   * 'login' ↔ 'signup' while open              ⇒ DO NOTHING (lock holds)
  useEffect(() => {
    const isAuthView = view === 'login' || view === 'signup'
    if (isAuthView && lockedAuthMode == null) {
      setLockedAuthMode(view)
    } else if (!isAuthView && lockedAuthMode != null) {
      setLockedAuthMode(null)
    }
  }, [view, lockedAuthMode])

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
    const allowed = ['banned', 'login', 'signup', 'terms', 'privacy', 'refund']
    if (!allowed.includes(view)) {
      window.location.hash = 'banned'
      setView('banned')
    }
  }, [sessionChecked, accessToken, user?.role, view])

  const goBack = () => {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    setView('landing')
  }
  // Open the dialog purely as a state toggle — no URL/hash change. The
  // landing page stays mounted underneath; the dialog drops on top
  // instantly. Direct navigation to #login still works because getView()
  // honours the hash.
  const goToLogin = () => setView('login')
  const goToSignup = () => setView('signup')
  const goToDashboardAfterSignup = () => {
    window.location.hash = 'thumbnails'
    setView('thumbnails')
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
    const appViews = ['thumbnails', 'pro', 'checkout', 'settings']
    if (appViews.includes(view) && !accessToken) {
      window.location.hash = 'login'
      setView('login')
    }
  }, [view, accessToken, sessionChecked])

  useEffect(() => {
    if (!sessionChecked || !accessToken) return
    if (useAuthStore.getState().user?.role === 'banned') return
    if (welcomeMode != null) return // splash already running, don't double-fire
    // Auth landed and the user came from the auth dialog (locked mode
    // captures both regular open + OAuth callback restoration). Show
    // the welcome splash; the splash's own timer hands off to
    // thumbnails when it finishes.
    if (lockedAuthMode != null && (['login', 'signup'].includes(view) || oauthCallbackPending)) {
      setWelcomeMode(lockedAuthMode)
    } else if (['login', 'signup'].includes(view)) {
      // Authed user arrived on a login/signup hash directly (e.g. they
      // typed the URL while already signed in). Skip the welcome
      // splash — there's no "they just logged in" event to celebrate.
      window.location.hash = 'thumbnails'
      setView('thumbnails')
    }
  }, [sessionChecked, accessToken, view, lockedAuthMode, oauthCallbackPending, welcomeMode])

  const completeWelcomeSplash = () => {
    setWelcomeMode(null)
    setLockedAuthMode(null)
    setOauthCallbackPending(false)
    window.location.hash = 'thumbnails'
    setView('thumbnails')
  }

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
      <Suspense fallback={null}>
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

  // Welcome splash — shown after auth lands and BEFORE we route to the
  // thumbnail screen. Centered "Welcome back" / "Welcome to Clixa";
  // calls completeWelcomeSplash() when the timer finishes which then
  // flips the hash + view forward.
  if (welcomeMode != null) {
    return <AuthSuccessSplash mode={welcomeMode} onDone={completeWelcomeSplash} />
  }

  // Returning from Google with `?code=…`. If we know which dialog the
  // user came from (intent persisted in sessionStorage by `_startOAuth`
  // and primed into `lockedAuthMode` at construct time), re-mount that
  // dialog with the `oauthInProgress` overlay so the user sees one
  // continuous "in progress" surface from click → return.
  //
  // Fallback: no intent stored (rare — direct deep-link to ?code=, or
  // sessionStorage cleared). Show the generic full-screen splash so
  // there's still something on screen during the exchange.
  if (oauthCallbackPending && lockedAuthMode == null) {
    return <Splash label="Signing you in…" />
  }

  // 'pro' is intentionally NOT in this list — it renders as its own
  // fullscreen takeover (ProScreen) and shouldn't flash the dashboard
  // shell loader before mounting. The auth gate above (line ~271) still
  // bounces unauthed users to login if they navigate directly to #pro.
  const appViews = ['dashboard', 'thumbnails', 'optimize', 'billing']
  const needsSessionBeforeRender = appViews.includes(view)
  // Branded splash on first authenticated entry — held while session
  // hydrates AND the subscription / history prefetches kick off in the
  // background. Once `sessionChecked` flips, the splash component fades
  // out (with a small minimum duration so it doesn't strobe).
  if (needsSessionBeforeRender && !sessionChecked) {
    return <Splash label="Setting up your workspace" />
  }
  if (appViews.includes(view) && !accessToken) {
    return null
  }

  // Banned: take over the screen.
  if (view === 'banned') {
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
  }

  // Marketing-area views — landing + login/signup dialogs render together
  // so LandingPage stays mounted across landing → login → signup
  // transitions (no remount, no flash, dialog drops in instantly).
  // `oauthCallbackPending` is also "marketing-territory" because the
  // user just came back from Google before we know their auth state.
  const isMarketingView =
    view === 'landing' || view === 'login' || view === 'signup' || oauthCallbackPending

  if (isMarketingView) {
    // `lockedAuthMode` is the source of truth for which dialog body
    // shows — see the dialog-mode-lock effect above. Once captured at
    // open time, it ignores any subsequent `view` flip between
    // `login` and `signup`, so a stray hash change can't swap a
    // half-filled signup form for the login screen.
    //
    // `oauthInProgress` becomes true on the OAuth callback render so
    // the dialog body shows a centered loading overlay (the Google
    // exchange takes ~300 ms). The user perceives the dialog as having
    // stayed open through the entire round-trip.
    return (
      <Suspense fallback={null}>
        <LandingPage />
        {lockedAuthMode === 'login' && (
          <Login
            onBack={goBack}
            onGoToSignup={goToSignup}
            onSuccess={onAuthSuccess}
            oauthInProgress={oauthCallbackPending}
          />
        )}
        {lockedAuthMode === 'signup' && (
          <Signup
            onBack={goBack}
            onGoToLogin={goToLogin}
            onSuccess={goToDashboardAfterSignup}
            oauthInProgress={oauthCallbackPending}
          />
        )}
      </Suspense>
    )
  }

  // Everything else is a single-element view — wrap in Suspense so its
  // lazy chunk can resolve without flashing the screen.
  let content = null
  switch (view) {
    case 'terms':
      content = <Terms onBack={goBack} />
      break
    case 'privacy':
      content = <PrivacyPolicy onBack={goBack} />
      break
    case 'refund':
      content = <RefundPolicy onBack={goBack} />
      break
    case 'thumbnails':
      content = <AuthenticatedRouteBoundary view="thumbnails" onLogout={onLogout} />
      break
    case 'pro':
      // Fullscreen pricing takeover — own component, no shell. Closes
      // back to thumbnails when authed, landing when not.
      content = (
        <ProScreen
          onClose={() => {
            const next = accessToken ? 'thumbnails' : ''
            if (next) {
              window.location.hash = next
            } else {
              window.history.replaceState(
                null,
                '',
                window.location.pathname + window.location.search
              )
              setView('landing')
            }
          }}
        />
      )
      break
    case 'checkout':
      // Stripe-style checkout takeover hosting the Paddle Inline iframe.
      // Closing returns to the pricing page so the user can pick a
      // different plan or cycle.
      content = (
        <CheckoutScreen
          onClose={() => {
            window.location.hash = 'pro'
          }}
        />
      )
      break
    case 'settings':
      content = <AuthenticatedRouteBoundary view="settings" onLogout={onLogout} />
      break
    case 'not-found':
      // Full-screen standalone — NOT wrapped in AuthenticatedRouteBoundary.
      // The user is on a route that doesn't exist; surrounding it with
      // the app shell (sidebar, topbar) implies "you're somewhere in
      // the app" which is misleading. Both authenticated and anonymous
      // users see the same screen — the only difference is where the
      // recovery CTA sends them (dashboard vs landing).
      content = <NotFound isAuthenticated={!!accessToken} />
      break
    default:
      content = <LandingPage />
  }

  return <Suspense fallback={null}>{content}</Suspense>
}

export default App
