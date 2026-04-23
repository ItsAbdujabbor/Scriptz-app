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
import { installPaywallInterceptor } from './lib/paywallInterceptor'
import { installConversationLRU } from './queries/thumbnails/conversationLRU'

installPaywallInterceptor()

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
// Cap the in-memory thumbnail conversation cache at the most-recent 50
// chats; persists the order to localStorage so the LRU bookkeeping
// survives reloads (messages re-fetch lazily on first open).
installConversationLRU(queryClient, { capacity: 50 })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
)
