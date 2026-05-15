/**
 * Self-contained SettingsModal that reads from Zustand stores directly,
 * eliminating the need for every screen to prop-drill auth state.
 */
import { useCallback } from 'react'
import { useAuthStore } from '../stores/authStore'
import { resetClientCachesForDataDelete } from '../lib/sessionReset'
import { useSubscriptionQuery } from '../queries/billing/creditsQueries'
import {
  useEmailPreferencesQuery,
  useSaveEmailPreferencesMutation,
} from '../queries/user/emailPreferencesQueries'
import { SettingsModal } from './SettingsModal'

export function SharedSettingsModal({ open, onClose, onLogout }) {
  const { user, logout, deleteData, deleteAccount, allowsPasswordlessAccountDelete } =
    useAuthStore()

  const { data: subscription } = useSubscriptionQuery()
  const {
    data: emailPreferences,
    isLoading: emailPreferencesLoading,
    isError: emailPreferencesError,
  } = useEmailPreferencesQuery()
  const saveEmailPreferences = useSaveEmailPreferencesMutation()

  // "Reset my data" clears server state + every cached artifact: React
  // Query entries, persona/style selection, onboarding prefs, sidebar
  // UI state. Auth session preserved.
  // After clearing we reload the page with a clean URL so no stale React
  // state, Zustand state, or hash-embedded conversation IDs survive.
  const clearLocalData = useCallback(() => {
    resetClientCachesForDataDelete()
    // Strip the hash (which may carry a now-deleted conversation id) and
    // reload so the app boots into a genuinely blank slate — no ghost
    // conversations, personas, or styles cached anywhere.
    setTimeout(() => {
      window.location.replace(window.location.pathname + window.location.search)
    }, 50)
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
      deleteData={deleteData}
      deleteAccount={deleteAccount}
      clearLocalData={clearLocalData}
      subscription={subscription}
      emailPreferences={emailPreferences}
      emailPreferencesLoading={emailPreferencesLoading}
      emailPreferencesError={emailPreferencesError}
      saveEmailPreferences={(prefs) => saveEmailPreferences.mutateAsync(prefs)}
      onLogout={handleLogout}
    />
  )
}
