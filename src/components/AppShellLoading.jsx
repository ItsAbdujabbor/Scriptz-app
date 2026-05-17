import { useAuthStore } from '../stores/authStore'
import { AppShellLayout } from './AppShellLayout'
import { Sidebar } from '../app/Sidebar'
import '../app/Sidebar.css'
// Shell.css holds the load-bearing app-shell layout rules
// (`.dashboard-app-shell`, `.dashboard-shell-unified`, the `.coach-page`
// desktop/mobile overrides + `.coach-main-wrap` card) extracted from the
// now-retired Dashboard.css / Optimize.css views, so the loading shell
// no longer drags in ~12k lines of dead stylesheet.
import '../styles/Shell.css'
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
