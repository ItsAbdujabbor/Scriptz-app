import { useAuthStore } from '../stores/authStore'
import { AppShellLayout } from './AppShellLayout'
import { Sidebar } from '../app/Sidebar'
import '../app/Sidebar.css'
// These imports look unused but they're load-bearing — Dashboard.css owns
// `.dashboard-app-shell` + `.dashboard-shell-unified` (the flex grid every
// authenticated view sits in, see AuthenticatedRoutes.jsx). Optimize.css
// holds shared `.coach-*` empty-state rules. Don't drop them just because
// the Dashboard / Optimize routes are retired.
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

  const currentScreen = view === 'pro' ? 'pro' : view === 'settings' ? 'settings' : 'thumbnails'

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
            currentScreen={currentScreen}
          />
        }
      >
        {null}
      </AppShellLayout>
    </div>
  )
}
