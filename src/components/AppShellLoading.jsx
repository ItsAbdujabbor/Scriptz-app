import { useAuthStore } from '../stores/authStore'
import { getCoachHashState } from '../lib/coachHashRoute'
import { Sidebar } from '../app/Sidebar'
import '../app/Sidebar.css'
import '../app/Dashboard.css'
import '../app/CoachChat.css'
import '../app/Templates.css'
import './AppShellLoading.css'

function RouteSpinner({ label = 'Loading…' }) {
  return (
    <div className="route-loading-pane" role="status" aria-live="polite" aria-label={label}>
      <div className="route-loading-spinner" aria-hidden />
    </div>
  )
}

/**
 * Shown while the authenticated route chunk loads or session hydrates.
 * Keeps the sidebar mounted so navigation does not flash a full-screen blank state.
 */
export function AppShellLoading({ view, onLogout }) {
  const user = useAuthStore((s) => s.user)
  const coach = view === 'coach' ? getCoachHashState() : null

  const noop = () => {}

  const sidebarCoach = coach || {
    activeTab: 'coach',
    coachConversationId: null,
    scriptConversationId: null,
    thumbnailConversationId: null,
  }

  const handleNewChat = () => {
    window.location.hash = 'coach'
  }

  if (view === 'templates') {
    return (
      <div className="dashboard-page">
        <div className="dashboard-app-shell">
          <Sidebar
            user={user}
            currentScreen="templates"
            onLogout={onLogout}
            onOpenSettings={noop}
            onOpenPersonas={noop}
          />
          <main className="dashboard-main-wrap dashboard-main-wrap--route-loading">
            <div className="templates-shell templates-main--route-loading">
              <RouteSpinner label="Loading templates" />
            </div>
          </main>
        </div>
      </div>
    )
  }

  if (view === 'coach') {
    return (
      <div className="coach-page">
        <div className="coach-app-shell">
          <Sidebar
            user={user}
            onOpenSettings={noop}
            onOpenPersonas={noop}
            onLogout={onLogout}
            currentScreen="coach"
            activeTab={sidebarCoach.activeTab}
            activeConversationId={sidebarCoach.coachConversationId}
            activeScriptConversationId={sidebarCoach.scriptConversationId}
            activeThumbnailConversationId={sidebarCoach.thumbnailConversationId}
            onNewChat={handleNewChat}
          />
          <main className="coach-main-wrap coach-main-wrap--route-loading">
            <RouteSpinner label="Loading workspace" />
          </main>
        </div>
      </div>
    )
  }

  const currentScreen =
    view === 'dashboard'
      ? 'dashboard'
      : view === 'optimize'
        ? 'optimize'
        : view === 'pro'
          ? 'pro'
          : 'dashboard'

  return (
    <div className="dashboard-page">
      <div className="dashboard-app-shell">
        <Sidebar
          user={user}
          onOpenSettings={noop}
          onOpenPersonas={noop}
          onLogout={onLogout}
          currentScreen={currentScreen}
        />
        <main className="dashboard-main-wrap dashboard-main-wrap--route-loading">
          <RouteSpinner label="Loading page" />
        </main>
      </div>
    </div>
  )
}
