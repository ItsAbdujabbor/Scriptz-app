import './AppShellLayout.css'
import { useSidebarStore } from '../stores/sidebarStore'

/**
 * Single authenticated layout: left `Sidebar` + main column.
 * Use on Dashboard, Coach, Optimize, Pro, Templates (and loading shell) so behavior and motion match everywhere.
 *
 * @param {boolean} [shellOnly] — If true, render only the inner shell row (no outer `pageClassName` wrapper). Use when the page needs siblings (e.g. Coach modals) inside a custom page wrapper.
 * Shell always wraps sidebar + main in `dashboard-shell-unified` (`--split` vs `--merged`) so expand/collapse can animate on one stable node.
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
    </div>
  )
  if (shellOnly) return shell
  return <div className={pageClassName}>{shell}</div>
}
