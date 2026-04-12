import { useAuthStore } from '../stores/authStore'
import { getCoachHashState } from '../lib/coachHashRoute'
import { AppShellLayout } from './AppShellLayout'
import { IOSLoading } from './IOSLoading'
import { Sidebar } from '../app/Sidebar'
import '../app/Sidebar.css'
import '../app/Dashboard.css'
import '../app/CoachChat.css'
// import '../app/Templates.css' // next update — Templates moved to src/next-update-ideas
import './AppShellLoading.css'

function RouteSpinner({ label: _label = 'Loading…' }) {
  return (
    <div className="route-loading-pane">
      <IOSLoading size="lg" layout="center" />
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
        <AppShellLayout
          shellOnly
          mainClassName="dashboard-main-wrap dashboard-main-wrap--route-loading"
          sidebar={
            <Sidebar
              user={user}
              currentScreen="templates"
              onLogout={onLogout}
              onOpenSettings={noop}
              onOpenPersonas={noop}
            />
          }
        >
          <div className="dashboard-main-scroll">
            <div className="dashboard-main dashboard-main--subpage">
              <div className="dashboard-content-shell dashboard-content-shell--page">
                <div className="templates-shell templates-main--route-loading">
                  <RouteSpinner label="Loading templates" />
                </div>
              </div>
            </div>
          </div>
        </AppShellLayout>
      </div>
    )
  }

  if (view === 'coach') {
    return (
      <div className="coach-page">
        <AppShellLayout
          shellOnly
          mainClassName="coach-main-wrap coach-main-wrap--route-loading"
          sidebar={
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
          }
        >
          <RouteSpinner label="Loading workspace" />
        </AppShellLayout>
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
      <AppShellLayout
        shellOnly
        mainClassName="dashboard-main-wrap dashboard-main-wrap--route-loading"
        sidebar={
          <Sidebar
            user={user}
            onOpenSettings={noop}
            onOpenPersonas={noop}
            onLogout={onLogout}
            currentScreen={currentScreen}
          />
        }
      >
        <div className="dashboard-main-scroll">
          <div className="dashboard-main dashboard-main--subpage">
            <div className="dashboard-content-shell dashboard-content-shell--page">
              <RouteSpinner label="Loading page" />
            </div>
          </div>
        </div>
      </AppShellLayout>
    </div>
  )
}
