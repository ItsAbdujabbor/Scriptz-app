import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// design-tokens.css must load BEFORE every other stylesheet so its CSS
// custom properties (--accent-gradient, --surface-card, --radius-md, etc.)
// are resolved by every downstream rule. All app CSS should reference
// these tokens; legacy --dash-*/--vo-*/--auth-* names are aliased here.
import './design-tokens.css'
import './index.css'
import './dot-background.css'
import App from './App.jsx'
import { QueryClientProvider } from '@tanstack/react-query'
import { createAppQueryClient } from './lib/query/queryClient'
import { setAppQueryClient } from './lib/sessionReset'
import { subscribeCacheEvents } from './lib/query/broadcastSync'
import { queryKeys } from './lib/query/queryKeys'
import { initRum } from './lib/rum'
import { initAnalytics, trackPageView } from './lib/analytics'

// Global safety net: if anything throws before/during React mount, render a
// minimal recovery UI in #root rather than leaving a permanently blank page.
// AppErrorBoundary handles in-tree errors; this handles pre-mount failures.
window.addEventListener('error', (e) => {
  console.error('[clixa] uncaught error', e.error ?? e.message)
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('[clixa] unhandled rejection', e.reason)
})

try {
  initRum()
} catch (e) {
  console.warn('[clixa] initRum failed', e)
}
try {
  initAnalytics({ apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '' })
} catch (e) {
  console.warn('[clixa] initAnalytics failed', e)
}
// First page-load event. Route changes inside the SPA fire their own via
// the existing hash/route listener (see authStore + App.jsx wiring).
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => trackPageView())
}
// Paywall handling lives in the QueryClient's QueryCache/MutationCache
// onError hooks (see lib/query/queryClient.js). The old global
// fetch monkey-patch was removed — it converted 402 → fake-200-null,
// which masked the real error from React Query and made that handler
// dead code (SEC-07).

if (typeof document !== 'undefined') {
  const syncHidden = () => {
    document.body.classList.toggle('page-hidden', document.hidden)
  }
  syncHidden()
  document.addEventListener('visibilitychange', syncHidden)
}

/* Zoom-settling detector.

   Cmd/Ctrl + / – / 0 and trackpad pinch-zoom force every backdrop-filter
   surface to re-rasterise its blur at the new size on the next paint.
   In a blur-heavy UI that re-rasterisation takes more than one frame,
   so the user sees a millisecond flicker right as they start zooming.

   We can't intercept browser zoom (it's handled above the page), but we
   CAN detect that it's happening: Ctrl/Cmd+wheel, keyboard zoom
   shortcuts, and devicePixelRatio changes are all reliable signals.

   While zoom is settling we toggle `body.zoom-settling`; CSS (index.css)
   uses that class to freeze transitions/animations and replace
   backdrop-filter with its solid-colour fallback. After 350 ms of
   quiet we remove the class and the glass comes back. */
if (typeof window !== 'undefined') {
  let zoomTimer = null
  // 600 ms tail: long enough that a typical pinch gesture (400–500 ms
  // in practice) stays frozen end-to-end. Each new wheel/gesture event
  // refreshes the timer, so continuous pinches keep the freeze on.
  const SETTLE_MS = 600

  const markZoomSettling = () => {
    if (!document.body) return
    document.body.classList.add('zoom-settling')
    if (zoomTimer != null) clearTimeout(zoomTimer)
    zoomTimer = window.setTimeout(() => {
      document.body.classList.remove('zoom-settling')
      zoomTimer = null
    }, SETTLE_MS)
  }

  // Trackpad pinch-zoom + Ctrl+scroll.
  window.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey || e.metaKey) markZoomSettling()
    },
    { passive: true }
  )

  // Keyboard zoom shortcuts (Cmd/Ctrl + = / + / - / _ / 0). The '+' key
  // is on the same physical key as '=' on US keyboards so we match both.
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return
    const k = e.key
    if (k === '=' || k === '+' || k === '-' || k === '_' || k === '0') {
      markZoomSettling()
    }
  })

  // devicePixelRatio flips as the browser finishes applying a zoom step
  // — covers OS-level zoom gestures we wouldn't otherwise see.
  let lastDPR = window.devicePixelRatio || 1
  window.addEventListener('resize', () => {
    const nextDPR = window.devicePixelRatio || 1
    if (nextDPR !== lastDPR) {
      lastDPR = nextDPR
      markZoomSettling()
    }
  })

  // Safari / WebKit trackpad pinch fires non-standard gesture events
  // instead of ctrl-wheel. Chrome on Mac fires both — listening to
  // both is safe (we just refresh the same timer). We don't
  // preventDefault: we let the browser zoom normally, we only need
  // to KNOW it's happening so we can freeze transitions.
  window.addEventListener('gesturestart', markZoomSettling)
  window.addEventListener('gesturechange', markZoomSettling)
  window.addEventListener('gestureend', markZoomSettling)

  // visualViewport fires on pinch-zoom that changes only the visual
  // viewport (iOS Safari default; desktop Chrome with pinch-zoom
  // enabled). `scale` moves away from 1 during the gesture.
  if (window.visualViewport) {
    let lastScale = window.visualViewport.scale
    window.visualViewport.addEventListener('resize', () => {
      const nextScale = window.visualViewport.scale
      if (nextScale !== lastScale) {
        lastScale = nextScale
        markZoomSettling()
      }
    })
  }
}

const queryClient = createAppQueryClient()
setAppQueryClient(queryClient)

// Both calls read/write localStorage; a DOMException (private-browsing
// storage block) or a SyntaxError (corrupted stored JSON) would propagate
// to the top of the module and prevent createRoot from ever being reached,
// leaving a permanently blank page.
// LRU eviction disabled — conversations are now cached with Infinity gcTime
// so evicting them from React Query would cause messages to disappear on
// re-open. The installConversationLRU call is intentionally removed.

// Cross-tab cache sync. When tab A persists a new message or a
// failure event, it broadcasts the delta; every other tab on the
// same origin applies the same `setQueryData` so the conversation
// detail stays in sync without an extra fetch. See broadcastSync.js
// for the message shapes.
try {
  subscribeCacheEvents((evt) => {
    if (!evt || typeof evt !== 'object') return
    if (evt.kind === 'conversation:append') {
      const { conversationId, items } = evt
      if (conversationId == null || !Array.isArray(items) || items.length === 0) return
      queryClient.setQueryData(queryKeys.thumbnails.conversation(conversationId), (prev) => {
        if (!prev) return prev
        const cur = prev.messages?.items || []
        const knownIds = new Set(cur.map((m) => m?.id))
        const additions = items.filter((m) => m && !knownIds.has(m.id))
        if (additions.length === 0) return prev
        return { ...prev, messages: { ...(prev.messages || {}), items: [...cur, ...additions] } }
      })
    } else if (evt.kind === 'conversation:invalidate' && evt.conversationId != null) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.thumbnails.conversation(evt.conversationId),
      })
    } else if (evt.kind === 'conversations:invalidate') {
      queryClient.invalidateQueries({ queryKey: ['thumbnails', 'conversations'], exact: false })
    }
  })
} catch (e) {
  console.warn('[clixa] subscribeCacheEvents failed', e)
}

const rootEl = document.getElementById('root')
if (!rootEl) {
  console.error('[clixa] #root element not found — cannot mount React')
} else {
  try {
    createRoot(rootEl).render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </StrictMode>
    )
  } catch (e) {
    console.error('[clixa] createRoot failed', e)
    rootEl.innerHTML =
      '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0c;color:#e5e5e5;font-family:system-ui;text-align:center;padding:2rem;flex-direction:column;gap:1rem"><h2 style="color:#f87171;margin:0">Something went wrong</h2><p style="color:#aaa;margin:0">Please refresh the page.</p><button onclick="location.reload()" style="margin-top:.5rem;padding:.6rem 1.6rem;background:#1e1e2e;color:#e5e5e5;border:1px solid #333;border-radius:8px;cursor:pointer;font-size:.95rem">Refresh</button></div>'
  }
}
