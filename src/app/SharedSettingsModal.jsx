/**
 * Self-contained SettingsModal that reads from Zustand stores directly,
 * eliminating the need for every screen to prop-drill auth state.
 */
import { useCallback } from 'react'
import { useAuthStore } from '../stores/authStore'
import { resetClientCachesForDataDelete } from '../lib/sessionReset'
import { useSubscriptionQuery } from '../queries/billing/creditsQueries'
import { SettingsModal } from './SettingsModal'

export function SharedSettingsModal({ open, onClose, onLogout }) {
  const {
    user,
    logout,
    changePassword,
    deleteData,
    deleteAccount,
    allowsPasswordlessAccountDelete,
    isLoading: authLoading,
  } = useAuthStore()

  const { data: subscription } = useSubscriptionQuery()

  // "Reset my data" clears server state + every cached artifact: React
  // Query entries, persona/style selection, onboarding prefs, sidebar
  // UI state. Auth session preserved.
  const clearLocalData = useCallback(() => {
    resetClientCachesForDataDelete()
  }, [])

  const handleLogout = useCallback(async () => {
    await logout()
    onLogout?.()
  }, [logout, onLogout])

  return (
    <SettingsModal
      open={open}
      onClose={onClose}
      user={user}
      accountDeletePasswordOptional={
        typeof allowsPasswordlessAccountDelete === 'function' && allowsPasswordlessAccountDelete()
      }
      authLoading={authLoading}
      changePassword={changePassword}
      deleteData={deleteData}
      deleteAccount={deleteAccount}
      clearLocalData={clearLocalData}
      subscription={subscription}
      onLogout={handleLogout}
    />
  )
}
