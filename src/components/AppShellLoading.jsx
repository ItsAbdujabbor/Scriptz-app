import { useAuthStore } from '../stores/authStore'
import { AppShellLayout } from './AppShellLayout'
import { Sidebar } from '../app/Sidebar'
import '../app/Sidebar.css'
import '../app/Dashboard.css'
import '../app/Optimize.css'
import './AppShellLoading.css'

/**
 * Shown while the authenticated route chunk loads or session hydrates.
 * Keeps the sidebar mounted so navigation does not flash a full-screen blank
 * state. Content area is intentionally empty — each view renders its own
 * loading state once its module resolves.
 */
export function AppShellLoading({ view, onLogout }) {
  const user = useAuthStore((s) => s.user)
  const noop = () => {}

  const currentScreen =
    view === 'dashboard'
      ? 'dashboard'
      : view === 'thumbnails'
        ? 'thumbnails'
        : view === 'optimize'
          ? 'optimize'
          : view === 'pro'
            ? 'pro'
            : view === 'billing'
              ? 'billing'
              : 'dashboard'

  if (view === 'thumbnails') {
    return (
      <div className="coach-page">
        <AppShellLayout
          shellOnly
          mainClassName="coach-main-wrap coach-main-wrap--route-loading"
          sidebar={
            <Sidebar
              user={user}
              onOpenSettings={noop}
              onLogout={onLogout}
              currentScreen="thumbnails"
            />
          }
        >
          {null}
        </AppShellLayout>
      </div>
    )
  }

  return (
    <div className="dashboard-page">
      <AppShellLayout
        shellOnly
        mainClassName="dashboard-main-wrap dashboard-main-wrap--route-loading"
        sidebar={
          <Sidebar
            user={user}
            onOpenSettings={noop}
            onLogout={onLogout}
            currentScreen={currentScreen}
          />
        }
      >
        {null}
      </AppShellLayout>
    </div>
  )
}
