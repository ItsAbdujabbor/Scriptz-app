import { useState, useCallback, useMemo, lazy, Suspense } from 'react'
import { useAuthStore } from './stores/authStore'
import { useSidebarStore } from './stores/sidebarStore'
import { useCurrentScreen } from './lib/useCurrentScreen'
import { emitShellEvent } from './lib/shellEvents'
import { Sidebar } from './app/Sidebar'
import { CreatePersonaDialog } from './components/CreatePersonaDialog'
import { ToastStack } from './components/ToastStack'
// Each view is its own lazy chunk — Dashboard / Optimize / Billing are
// temporarily hidden from the UI; Pro stays reachable for the "Go Pro"
// CTA in the sidebar. (lazyViews.js still exports the hidden ones for
// the day they come back.)
import { Thumbnails, Pro } from './lazyViews'

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

  const [showPersonasModal, setShowPersonasModal] = useState(false)
  const [showStylesModal, setShowStylesModal] = useState(false)

  // Settings used to be a portal dialog gated by `settingsOpen` state.
  // It's now an in-shell route, so opening it just changes the hash —
  // the route boundary mounts the settings content inside `<main>` next
  // to the sidebar exactly like Dashboard / Optimize / Billing.
  const openSettings = useCallback((section) => {
    const target = section ? `settings/${section}` : 'settings'
    if (typeof window !== 'undefined') {
      window.location.hash = target
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
      case 'pro':
        return <Pro onLogout={onLogout} shellManaged />
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
      {isSettings && <SettingsLazy onLogout={handleLogout} />}

      {/* Always-mounted create-persona dialog. Listens for the
       * `app:open-create-persona-dialog` window event from anywhere in the
       * app (currently the "Create persona from images" button inside
       * PersonasModal). Mounted at this level — same as SharedSettingsModal
       * — so it renders independently of any modal it's launched from. */}
      <CreatePersonaDialog />

      {/* Global toast stack — listens for `app:toast` events and shows
       *  dismissible top-right notifications. Mounted here at the
       *  authenticated-routes root so every screen has it (Dashboard,
       *  Optimize, Pro all wrap themselves in AppShellLayout, but
       *  Thumbnails does not — the toast lived inside AppShellLayout
       *  before, which meant the thumbnail screen had no toast UI). */}
      <ToastStack />
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
function SettingsLazy({ onLogout }) {
  // Closing settings goes back to thumbnails — dashboard is hidden right
  // now (back/swipe behaviour can still reach other routes normally;
  // this is just the explicit ✕ tap).
  const handleClose = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.location.hash = 'thumbnails'
    }
  }, [])
  return (
    <Suspense fallback={null}>
      <SettingsModule open onClose={handleClose} onLogout={onLogout} />
    </Suspense>
  )
}
