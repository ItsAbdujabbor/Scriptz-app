import { useState, useCallback, useMemo, lazy, Suspense } from 'react'
import { useAuthStore } from './stores/authStore'
import { useSidebarStore } from './stores/sidebarStore'
import { useCurrentScreen } from './lib/useCurrentScreen'
import { emitShellEvent } from './lib/shellEvents'
import { Sidebar } from './app/Sidebar'
import { SharedSettingsModal } from './app/SharedSettingsModal'
import { CreatePersonaDialog } from './components/CreatePersonaDialog'
import { Dashboard } from './app/Dashboard'
import { Thumbnails } from './app/Thumbnails'
import { Optimize } from './app/Optimize'
import { Pro } from './app/Pro'
import { ABTesting } from './app/ABTesting'
import { Billing } from './app/Billing'

import './app/Sidebar.css'
import './app/Dashboard.css'

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

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState('account')
  const [showPersonasModal, setShowPersonasModal] = useState(false)
  const [showStylesModal, setShowStylesModal] = useState(false)

  const openSettings = useCallback((section) => {
    setSettingsSection(section ?? 'account')
    setSettingsOpen(true)
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

  const isThumbnails = view === 'thumbnails'

  const content = (() => {
    switch (view) {
      case 'dashboard':
        return <Dashboard onLogout={onLogout} shellManaged />
      case 'thumbnails':
        return (
          <Thumbnails
            onOpenPersonas={() => setShowPersonasModal(true)}
            onOpenStyles={() => setShowStylesModal(true)}
          />
        )
      case 'optimize':
        return <Optimize onLogout={onLogout} shellManaged />
      case 'pro':
        return <Pro onLogout={onLogout} shellManaged />
      case 'ab-testing':
        return <ABTesting onLogout={onLogout} shellManaged />
      case 'billing':
        return <Billing onLogout={onLogout} shellManaged />
      default:
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
          <main className={mainClass}>{content}</main>
        </div>
      </div>

      <SharedSettingsModal
        open={settingsOpen}
        initialSection={settingsSection}
        onClose={() => setSettingsOpen(false)}
        onLogout={handleLogout}
      />

      {showPersonasModal && <PersonasModalLazy onClose={() => setShowPersonasModal(false)} />}
      {showStylesModal && <StylesModalLazy onClose={() => setShowStylesModal(false)} />}

      {/* Always-mounted create-persona dialog. Listens for the
       * `app:open-create-persona-dialog` window event from anywhere in the
       * app (currently the "Create persona from images" button inside
       * PersonasModal). Mounted at this level — same as SharedSettingsModal
       * — so it renders independently of any modal it's launched from. */}
      <CreatePersonaDialog />
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
