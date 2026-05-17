import { useState, useCallback, useMemo, lazy, Suspense, useEffect } from 'react'
import { useAuthStore } from './stores/authStore'
import { useSidebarStore } from './stores/sidebarStore'
import { useCurrentScreen } from './lib/useCurrentScreen'
import { emitShellEvent } from './lib/shellEvents'
import { Sidebar } from './app/Sidebar'
import { CreatePersonaDialog } from './components/CreatePersonaDialog'
import { BillingDialog } from './components/BillingDialog'
import { ToastStack } from './components/ToastStack'
import ActivationListener from './components/ActivationListener'
import { CelebrationOverlay } from './components/CelebrationOverlay'
import { SubscriptionActivationSplash } from './components/SubscriptionActivationSplash'
import { PaymentProcessingBanner } from './components/PaymentProcessingBanner'
import { connectJobEventStream, disconnectJobEventStream } from './services/jobEventStream'
// Each view is its own lazy chunk — Dashboard / Optimize / Billing are
// temporarily hidden from the UI.
import { Thumbnails } from './lazyViews'

import './app/Sidebar.css'

/**
 * Shared authenticated shell: one Sidebar + one SettingsModal across all screens.
 *
 * The outer wrapper keeps the same DOM element across navigation so the
 * Sidebar never remounts. This eliminates:
 *  - Duplicate API calls on every screen change
 *  - Sidebar scroll-position resets
 *  - SettingsModal state loss when navigating
 */
export default function AuthenticatedRoutes({ view, onLogout }) {
  const user = useAuthStore((s) => s.user)
  const sidebarCollapsed = useSidebarStore((s) => s.collapsed)
  const screenState = useCurrentScreen()

  // Open the SSE stream for live job-lifecycle events as soon as we're
  // authenticated. The connection lives for the duration of this
  // mount; logout (or unmount) tears it down. Token refresh is handled
  // implicitly: we re-acquire a valid token via the auth store, and
  // the EventSource client reconnects with backoff if the token
  // rotates underneath us.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const token = await useAuthStore.getState().getValidAccessToken()
        if (!cancelled && token) {
          connectJobEventStream(token)
        }
      } catch {
        // Token unavailable — polling carries the load.
      }
    })()
    return () => {
      cancelled = true
      disconnectJobEventStream()
    }
  }, [])

  const [showPersonasModal, setShowPersonasModal] = useState(false)
  const [showStylesModal, setShowStylesModal] = useState(false)

  // Remembers the hash (e.g. "thumbnails?id=42") that was active just
  // before the user opened settings so we can restore it on close —
  // otherwise the hashchange listener in Thumbnails.jsx sees the bare
  // "#thumbnails" and resets conversationId to null, starting an
  // unwanted new chat.
  const [settingsReturnHash, setSettingsReturnHash] = useState('thumbnails')

  const openSettings = useCallback((section) => {
    if (typeof window !== 'undefined') {
      const current = (window.location.hash || '').replace(/^#/, '')
      if (current && !current.startsWith('settings')) {
        setSettingsReturnHash(current)
      }
      window.location.hash = section ? `settings/${section}` : 'settings'
    }
  }, [])

  const handleNewChat = useCallback(() => {
    emitShellEvent('newChat')
  }, [])

  const handleLogout = useCallback(async () => {
    await useAuthStore.getState().logout()
    onLogout?.()
  }, [onLogout])

  const sidebar = useMemo(
    () => (
      <Sidebar
        user={user}
        onOpenSettings={openSettings}
        onOpenPersonas={() => setShowPersonasModal(true)}
        onOpenStyles={() => setShowStylesModal(true)}
        onLogout={handleLogout}
        currentScreen={screenState.currentScreen}
        activeThumbnailConversationId={screenState.thumbnailConversationId}
        onNewChat={handleNewChat}
      />
    ),
    [user, openSettings, handleLogout, screenState, handleNewChat]
  )

  const shellClass = [
    'dashboard-app-shell',
    'app-shell-root',
    sidebarCollapsed
      ? 'dashboard-app-shell--sidebar-collapsed'
      : 'dashboard-app-shell--sidebar-expanded',
  ].join(' ')
  const unifiedClass = [
    'dashboard-shell-unified',
    sidebarCollapsed ? 'dashboard-shell-unified--merged' : 'dashboard-shell-unified--split',
  ].join(' ')

  // Settings is no longer a swappable view — it's a centred dialog
  // overlaid on the underlying screen. When the URL hash is "settings"
  // we still render thumbnails (the home surface) underneath and pop
  // the dialog on top, so deep-linking to #settings still works and
  // closing the dialog reveals the thumbnail page already mounted.
  const isSettings = view === 'settings'
  const baseView = isSettings ? 'thumbnails' : view
  const isThumbnails = baseView === 'thumbnails'

  const content = (() => {
    switch (baseView) {
      case 'thumbnails':
        return (
          <Thumbnails
            onOpenPersonas={() => setShowPersonasModal(true)}
            onOpenStyles={() => setShowStylesModal(true)}
          />
        )
      default:
        // Unknown view shouldn't reach here — App.jsx now redirects
        // every legacy hash (dashboard / optimize / billing) to
        // 'thumbnails', and the 'not-found' case is handled full-screen
        // upstream. If something does land here, render nothing so the
        // upstream desync is visible rather than masked.
        return null
    }
  })()

  const pageClass = isThumbnails ? 'coach-page' : 'dashboard-page'
  const mainClass = isThumbnails ? 'coach-main-wrap coach-main-wrap--thumb' : 'dashboard-main-wrap'

  return (
    <div className={pageClass}>
      <div className={shellClass}>
        <div className={unifiedClass}>
          {sidebar}
          <main className={mainClass}>
            {/* Suspense fallback is intentionally empty — the sidebar +
             *  shell stay rendered, so the user sees the chrome instantly
             *  while the view chunk loads. Dashboard's own skeletons take
             *  over the moment its module resolves. */}
            <Suspense fallback={null}>{content}</Suspense>
          </main>
        </div>
      </div>

      {showPersonasModal && <PersonasModalLazy onClose={() => setShowPersonasModal(false)} />}
      {showStylesModal && <StylesModalLazy onClose={() => setShowStylesModal(false)} />}

      {/* Settings dialog — portal-mounted overlay, opens whenever the
       * hash is #settings. The underlying view (thumbnails) stays
       * rendered behind so closing the dialog reveals the user's
       * actual workspace, not a remount. */}
      {isSettings && <SettingsLazy onLogout={handleLogout} returnHash={settingsReturnHash} />}

      {/* Always-mounted create-persona dialog. Listens for the
       * `app:open-create-persona-dialog` window event from anywhere in the
       * app (currently the "Create persona from images" button inside
       * PersonasModal). Mounted at this level — same as SharedSettingsModal
       * — so it renders independently of any modal it's launched from. */}
      <CreatePersonaDialog />

      {/* Always-mounted billing dialog. Listens for
       * `app:open-billing-dialog` (sidebar Billing button, low-balance
       * prompts, etc.) and renders the same plan + payment + invoices
       * surface the legacy `#billing` screen had — but as a centred
       * modal that matches the rest of the app's dialog language. */}
      <BillingDialog />

      {/* Global toast stack — listens for `app:toast` events and shows
       *  dismissible top-right notifications. Mounted here at the
       *  authenticated-routes root so every screen has it (Dashboard,
       *  Optimize, Pro all wrap themselves in AppShellLayout, but
       *  Thumbnails does not — the toast lived inside AppShellLayout
       *  before, which meant the thumbnail screen had no toast UI). */}
      <ToastStack />

      {/* Post-checkout billing UX — mounted here so activation polling,
       *  celebration, and the "still confirming" banner fire on ALL
       *  screens including Thumbnails, which does not use AppShellLayout.
       *  Previously these only mounted inside AppShellLayout, so a user
       *  landing back on #thumbnails after checkout never saw the splash
       *  or had their subscription status updated. */}
      <ActivationListener />
      <CelebrationOverlay />
      <SubscriptionActivationSplash />
      <PaymentProcessingBanner />
    </div>
  )
}

const PersonasModalModule = lazy(() =>
  import('./app/PersonasModal').then((m) => ({ default: m.PersonasModal }))
)
function PersonasModalLazy({ onClose }) {
  return (
    <Suspense fallback={null}>
      <PersonasModalModule onClose={onClose} />
    </Suspense>
  )
}

const StylesModalModule = lazy(() =>
  import('./app/StylesModal').then((m) => ({ default: m.StylesModal }))
)
function StylesModalLazy({ onClose }) {
  return (
    <Suspense fallback={null}>
      <StylesModalModule onClose={onClose} />
    </Suspense>
  )
}

// Settings — wraps SharedSettingsModal as a routed view. The component
// already accepts the `open` prop for legacy callers; we always pass
// `open={true}` because being on the settings hash IS the open state.
const SettingsModule = lazy(() =>
  import('./app/SharedSettingsModal').then((m) => ({ default: m.SharedSettingsModal }))
)
function SettingsLazy({ onLogout, returnHash = 'thumbnails' }) {
  // Restore the exact hash that was active before settings opened so that
  // Thumbnails.jsx's hashchange listener keeps the same conversationId
  // (avoids an unwanted "new chat" when the user closes settings).
  const handleClose = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.location.hash = returnHash
    }
  }, [returnHash])
  return (
    <Suspense fallback={null}>
      <SettingsModule open onClose={handleClose} onLogout={onLogout} />
    </Suspense>
  )
}
