import { useState, useCallback, useMemo, lazy, Suspense } from 'react'
import { useAuthStore } from './stores/authStore'
import { useSidebarStore } from './stores/sidebarStore'
import { useCurrentScreen } from './lib/useCurrentScreen'
import { emitShellEvent } from './lib/shellEvents'
import { Sidebar } from './app/Sidebar'
import { SharedSettingsModal } from './app/SharedSettingsModal'
import { CreatePersonaDialog } from './components/CreatePersonaDialog'
import { Dashboard } from './app/Dashboard'
import { CoachChat } from './app/CoachChat'
import { Optimize } from './app/Optimize'
import { Pro } from './app/Pro'
import { ABTesting } from './app/ABTesting'
import { Billing } from './app/Billing'
// import { Templates } from './app/Templates' // moved to src/next-update-ideas/Templates

import './app/Sidebar.css'
import './app/Dashboard.css'
import './app/CoachChat.css'

/**
 * Shared authenticated shell: one Sidebar + one SettingsModal across all screens.
 *
 * The outer wrapper switches class between `coach-page` and `dashboard-page` on navigation.
 * React reconciles it as the same DOM element, so the Sidebar never remounts.
 * This eliminates:
 *  - Duplicate chat-history API calls on every screen change
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

  const isCoach = view === 'coach'

  const sidebar = useMemo(
    () => (
      <Sidebar
        user={user}
        onOpenSettings={openSettings}
        onOpenPersonas={() => setShowPersonasModal(true)}
        onOpenStyles={() => setShowStylesModal(true)}
        onLogout={handleLogout}
        currentScreen={screenState.currentScreen}
        activeTab={screenState.activeTab}
        activeConversationId={screenState.activeConversationId}
        activeScriptConversationId={screenState.activeScriptConversationId}
        activeThumbnailConversationId={screenState.activeThumbnailConversationId}
        onNewChat={handleNewChat}
      />
    ),
    [user, openSettings, handleLogout, screenState, handleNewChat]
  )

  // Shell layout classes
  const pageClass = isCoach ? 'coach-page' : 'dashboard-page'
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
  const mainClass = isCoach ? 'coach-main-wrap' : 'dashboard-main-wrap'

  const content = (() => {
    switch (view) {
      case 'dashboard':
        return <Dashboard onLogout={onLogout} shellManaged />
      case 'coach':
        return <CoachChat onLogout={onLogout} shellManaged />
      case 'optimize':
        return <Optimize onLogout={onLogout} shellManaged />
      case 'pro':
        return <Pro onLogout={onLogout} shellManaged />
      case 'ab-testing':
        return <ABTesting onLogout={onLogout} shellManaged />
      case 'billing':
        return <Billing onLogout={onLogout} shellManaged />
      // case 'templates': return <Templates onLogout={onLogout} shellManaged /> // next update
      default:
        return null
    }
  })()

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
