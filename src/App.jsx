import { useState, useEffect, useLayoutEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from './stores/authStore'
import { BannedScreen } from './auth/BannedScreen'
// AuthDialog is an eager import — see comment by the lazy block below.
import { AuthDialog } from './auth/AuthDialog'
import { AuthSuccessSplash } from './auth/AuthSuccessSplash'
import { prefetchHistoryConversations } from './lib/query/prefetchHistoryConversations'
import { prefetchSubscription, seedSubscriptionFromCache } from './lib/query/prefetchSubscription'
import { prefetchCredits } from './queries/billing/creditsQueries'
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
// AuthDialog is an eager import at the top of this file. Lazy-loading
// it caused a flash + delay when the user clicked Sign In on the landing
// page — the dialog should appear instantly with no loader.
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
 *  wherever the user came from.
 *
 *  Preload trigger: every "Go Pro" / premium-locked button can route
 *  here at any moment, so we kick off the chunk fetch on idle right
 *  after the first paint. That way navigation feels instant — no
 *  Suspense-fallback flicker between the click and the screen
 *  appearing. */
const ProScreen = lazy(() => import('./app/ProScreen').then((m) => ({ default: m.ProScreen })))
if (typeof window !== 'undefined') {
  const kick = () => import('./app/ProScreen')
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(kick, { timeout: 2500 })
  } else {
    setTimeout(kick, 1200)
  }
}

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
  // Single auth surface. `#signin` is the primary; `#login` / `#register`
  // / `#signup` are kept for back-compat and resolve to the same view.
  if (h === 'signin' || h === 'login' || h === 'signup' || h === 'register') return 'auth'
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
  // Whether the unified auth dialog is currently open. Stays true:
  //   • for the entire visible lifetime of the dialog,
  //   • across the OAuth round-trip (primed from sessionStorage so the
  //     dialog re-mounts with the loading overlay after Google bounces back).
  // Set to false on close (×) or after the welcome splash hands off.
  const [authDialogOpen, setAuthDialogOpen] = useState(() => {
    const v = getView()
    if (v === 'auth') return true
    if (urlIsOAuthCallback()) {
      try {
        if (sessionStorage.getItem('clixa_oauth_intent')) return true
      } catch {
        /* sessionStorage unavailable — fall through */
      }
    }
    return false
  })
  // Briefly show a centered welcome screen after auth lands but BEFORE
  // we route to thumbnails. Boolean: true = splash visible.
  const [showWelcomeSplash, setShowWelcomeSplash] = useState(false)
  // Sticky flag: did we mount on an OAuth callback URL (`?code=...`)?
  // Captured ONCE at first render so the post-exchange routing in the
  // ensureSession `.then` block can decide unambiguously whether to show
  // the welcome splash. We can't rely on `authDialogOpen` for this — the
  // auto-flip effect that mirrors `authDialogOpen` off `view` (line ~290)
  // races the ensureSession promise and, in dev StrictMode, the effect's
  // closure can already see `authDialogOpen=false` by the time `.then`
  // fires, dropping the user on the landing page instead of routing
  // them into the thumbnail generator.
  const wasOAuthCallbackRef = useRef(urlIsOAuthCallback())
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
        // Kick off subscription + credits + history network revalidation
        // the moment auth is settled. All three fire IN PARALLEL so by
        // the time Sidebar / ThumbnailGenerator / HeaderCreditsBadge
        // mount, the data is either already in cache or landing in the
        // same RTT — no per-component fetch waterfall after the lazy
        // chunk loads. Critically, credits has no localStorage seed
        // (unlike subscription), so without this prefetch the badge
        // first fires only when it mounts inside the lazy chunk.
        if (token && st.user?.role !== 'banned') {
          prefetchSubscription(queryClient).catch(() => {})
          prefetchCredits(queryClient).catch(() => {})
          prefetchHistoryConversations(queryClient).catch(() => {})
        }
        if (token && st.user?.role === 'banned') {
          if (hash !== 'banned') {
            window.location.hash = 'banned'
          }
          setView('banned')
          return
        }
        if (token) {
          // OAuth round-trip just landed (`?code=...` on initial mount)
          // — ALWAYS hand off to the welcome splash, which routes the
          // user into the thumbnail generator. We branch on the sticky
          // `wasOAuthCallbackRef` rather than `authDialogOpen`, because
          // the auto-flip effect (line ~290) can have already cleared
          // `authDialogOpen` by the time this `.then` fires; relying on
          // it left users on the landing page in dev StrictMode.
          if (wasOAuthCallbackRef.current) {
            wasOAuthCallbackRef.current = false
            setShowWelcomeSplash(true)
          } else if (!hash) {
            // Returning user with a saved session, no dialog, no callback.
            // Skip the splash and route straight in.
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

  // Sync authDialogOpen with the auth view. Opening / closing the dialog
  // via the X button or successful auth both flip `view` first; this
  // effect just mirrors that into the boolean source-of-truth.
  useEffect(() => {
    if (view === 'auth' && !authDialogOpen) setAuthDialogOpen(true)
    else if (view !== 'auth' && authDialogOpen) setAuthDialogOpen(false)
  }, [view, authDialogOpen])

  useEffect(() => {
    if (!sessionChecked) return
    if (view === 'banned' && !accessToken) {
      window.location.hash = 'signin'
      setView('auth')
    }
  }, [sessionChecked, view, accessToken])

  useEffect(() => {
    if (!sessionChecked || !accessToken || user?.role !== 'banned') return
    const allowed = ['banned', 'auth', 'terms', 'privacy', 'refund']
    if (!allowed.includes(view)) {
      window.location.hash = 'banned'
      setView('banned')
    }
  }, [sessionChecked, accessToken, user?.role, view])

  const goBack = () => {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    setView('landing')
  }
  const onLogout = async () => {
    try {
      await logout()
    } catch {
      /* ignore — still navigate away */
    }
    window.location.hash = 'signin'
    setView('auth')
  }

  useEffect(() => {
    if (!sessionChecked) return
    const appViews = ['thumbnails', 'pro', 'checkout', 'settings']
    if (appViews.includes(view) && !accessToken) {
      window.location.hash = 'signin'
      setView('auth')
    }
  }, [view, accessToken, sessionChecked])

  useEffect(() => {
    if (!sessionChecked || !accessToken) return
    if (useAuthStore.getState().user?.role === 'banned') return
    if (showWelcomeSplash) return // already running, don't double-fire
    if (authDialogOpen || oauthCallbackPending) {
      // Auth landed and the user came from the dialog (regular open
      // or OAuth callback). Show the welcome splash; its own timer
      // hands off to thumbnails when it finishes.
      setShowWelcomeSplash(true)
    } else if (view === 'auth') {
      // Authed user arrived on a #signin hash directly (e.g. they typed
      // the URL while already signed in). Skip the splash.
      window.location.hash = 'thumbnails'
      setView('thumbnails')
    }
  }, [sessionChecked, accessToken, view, authDialogOpen, oauthCallbackPending, showWelcomeSplash])

  // Stable ref so AuthSuccessSplash's `useEffect([durationMs, onDone])`
  // doesn't tear down + restart its 1.1s timer every time App re-renders.
  // A non-stable callback ref was making the timer reset on every
  // ambient render (subscription cache fill, theme change, etc.) and
  // the splash could appear "stuck" indefinitely.
  const completeWelcomeSplashRef = useRef(null)
  useEffect(() => {
    completeWelcomeSplashRef.current = () => {
      setShowWelcomeSplash(false)
      setAuthDialogOpen(false)
      setOauthCallbackPending(false)
      window.location.hash = 'thumbnails'
      setView('thumbnails')
    }
  })
  const completeWelcomeSplash = useCallback(() => {
    completeWelcomeSplashRef.current?.()
  }, [])

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
  // thumbnail screen. Centered "Welcome to Clixa"; calls
  // completeWelcomeSplash() when its timer finishes, which flips the
  // hash + view forward.
  if (showWelcomeSplash) {
    return <AuthSuccessSplash onDone={completeWelcomeSplash} />
  }

  // Returning from Google with `?code=…`. If we know the dialog was
  // open (primed into `authDialogOpen` at construct time from
  // sessionStorage), the marketing-view branch below re-mounts the
  // AuthDialog with the loading overlay. Otherwise fall back to the
  // full-screen splash so there's still something on screen during
  // the exchange.
  if (oauthCallbackPending && !authDialogOpen) {
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

  // Marketing-area views — landing + the unified AuthDialog render together
  // so LandingPage stays mounted (no remount, no flash, dialog drops in
  // instantly). `oauthCallbackPending` is also "marketing-territory"
  // because the user just came back from Google before we know their
  // auth state.
  const isMarketingView = view === 'landing' || view === 'auth' || oauthCallbackPending

  if (isMarketingView) {
    // `oauthInProgress` makes the dialog body show a centered loading
    // overlay (the Google exchange takes ~300 ms) so the user perceives
    // the dialog as having stayed open through the entire round-trip.
    return (
      <Suspense fallback={null}>
        <LandingPage />
        {(authDialogOpen || oauthCallbackPending) && (
          <AuthDialog onClose={goBack} oauthInProgress={oauthCallbackPending} />
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
      // Subscriptions return to the pricing page; pack purchases return
      // to wherever they were launched from (session.returnHash).
      content = (
        <CheckoutScreen
          onClose={() => {
            try {
              const raw = sessionStorage.getItem('clixa_checkout_session')
              const sess = raw ? JSON.parse(raw) : null
              window.location.hash = sess?.returnHash || 'pro'
            } catch {
              window.location.hash = 'pro'
            }
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
