import './AppShellLayout.css'
import { useSidebarStore } from '../stores/sidebarStore'
import { CelebrationOverlay } from './CelebrationOverlay'
import { HeaderCreditsBadge } from './HeaderCreditsBadge' // kept as an optional override; no longer mounted by default
import ActivationListener from './ActivationListener'
import { PaymentProcessingBanner } from './PaymentProcessingBanner'

/**
 * Single authenticated layout: left `Sidebar` + main column.
 * Use on Dashboard, Coach, Optimize, Pro, Templates (and loading shell) so behavior and motion match everywhere.
 *
 * @param {boolean} [shellOnly] — If true, render only the inner shell row (no outer `pageClassName` wrapper). Use when the page needs siblings (e.g. Coach modals) inside a custom page wrapper.
 * Shell always wraps sidebar + main in `dashboard-shell-unified` (`--split` vs `--merged`) so expand/collapse can animate on one stable node.
 *
 * Credits live in the sidebar account pill (not in the header) — this layout
 * only wires up the Celebration overlay that reacts to subscription /
 * credit-pack purchase events.
 */
export function AppShellLayout({
  pageClassName,
  mainClassName,
  sidebar,
  children,
  shellOnly = false,
}) {
  const sidebarCollapsed = useSidebarStore((s) => s.collapsed)
  const shellClassName = [
    'dashboard-app-shell',
    'app-shell-root',
    sidebarCollapsed
      ? 'dashboard-app-shell--sidebar-collapsed'
      : 'dashboard-app-shell--sidebar-expanded',
  ].join(' ')

  const main = <main className={mainClassName}>{children}</main>

  const unifiedClassName = [
    'dashboard-shell-unified',
    sidebarCollapsed ? 'dashboard-shell-unified--merged' : 'dashboard-shell-unified--split',
  ].join(' ')

  const shell = (
    <div className={shellClassName}>
      <div className={unifiedClassName}>
        {sidebar}
        {main}
      </div>
      {/* Global celebration overlay — listens for `app:celebrate` events and
          shows a centered message + confetti for subscriptions, top-ups, etc. */}
      <CelebrationOverlay />
      {/* Watches subscription state for inactive→active transitions and
          fires the celebration once. Also bridges `app:checkout-completed`
          into the activation burst-poll mode so Pro lights up the moment
          the webhook lands. */}
      <ActivationListener />
      {/* Slim banner that surfaces when the 60-s burst times out without
          an active subscription showing up — fail-loud feedback for
          delayed webhooks (Paddle outage, our queue backlog, etc.). */}
      <PaymentProcessingBanner />
      {/* `<ToastStack />` lives at the AuthenticatedRoutes level so it's
          mounted on every authenticated page, including ones (like the
          thumbnail screen) that don't wrap themselves in AppShellLayout. */}
    </div>
  )
  if (shellOnly) return shell
  return <div className={pageClassName}>{shell}</div>
}

// Re-export for any page that still mounts it inline (e.g. none today — kept
// so the import doesn't orphan).
export { HeaderCreditsBadge }
