import { useState, useCallback, useMemo } from 'react'
import { useAuthStore } from './stores/authStore'
import { useSidebarStore } from './stores/sidebarStore'
import { useCurrentScreen } from './lib/useCurrentScreen'
import { emitShellEvent } from './lib/shellEvents'
import { Sidebar } from './app/Sidebar'
import { SharedSettingsModal } from './app/SharedSettingsModal'
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
        return <Thumbnails />
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
  const mainClass = isThumbnails ? 'coach-main-wrap' : 'dashboard-main-wrap'

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
    </div>
  )
}
