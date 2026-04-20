import { useAuthStore } from '../stores/authStore'
import { AppShellLayout } from './AppShellLayout'
import { PageSkeleton, SkeletonCard, SkeletonGroup, SkeletonText } from './ui'
import { Sidebar } from '../app/Sidebar'
import '../app/Sidebar.css'
import '../app/Dashboard.css'
import './AppShellLoading.css'

function RouteSpinner({ label = 'Loading page' }) {
  return (
    <div className="route-loading-pane">
      <PageSkeleton label={label}>
        <SkeletonGroup label={label}>
          <SkeletonCard ratio="16 / 6" lines={2} />
          <SkeletonCard ratio="16 / 9" lines={2} />
          <SkeletonText lines={2} lineHeight={14} />
        </SkeletonGroup>
      </PageSkeleton>
    </div>
  )
}

/**
 * Shown while the authenticated route chunk loads or session hydrates.
 * Keeps the sidebar mounted so navigation does not flash a full-screen blank state.
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
            : view === 'ab-testing'
              ? 'ab-testing'
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
          <RouteSpinner label="Loading thumbnails" />
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
