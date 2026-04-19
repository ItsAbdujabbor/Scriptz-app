/**
 * Clear client-side caches when the signed-in user changes or logs out.
 * Without this, React Query + localStorage show the previous account's data.
 */

import { useOnboardingStore } from '../stores/onboardingStore'
import { useStyleStore } from '../stores/styleStore'
import { usePersonaStore } from '../stores/personaStore'
import { useSidebarStore } from '../stores/sidebarStore'
import { resetPrefetchFlag } from './query/prefetchHistoryConversations'
import { API_AUTH_STORAGE_KEY } from './authMode'

let queryClientRef = null

export function setAppQueryClient(client) {
  queryClientRef = client
}

/** Set when a session exists; used to detect account switches. */
export const LAST_AUTH_USER_ID_KEY = 'scriptz_last_auth_user_id'

const ONBOARDING_KEY = 'scriptz_onboarding'
const SIDEBAR_KEY = 'scriptz_sidebar_ui'
const STYLE_PERSIST_KEY = 'scriptz_selected_style'
const PERSONA_PERSIST_KEY = 'scriptz_selected_persona'
const MILESTONE_PREFIX = 'scriptz-milestone-visit-v1:'

function removeMilestoneVisitKeys() {
  if (typeof localStorage === 'undefined') return
  const keys = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(MILESTONE_PREFIX)) keys.push(k)
  }
  keys.forEach((k) => localStorage.removeItem(k))
}

/**
 * Clear TanStack Query cache and all user-scoped persisted UI state.
 * Keeps theme (scriptz_theme) and Supabase session storage intact.
 */
export function resetClientCachesForUserChange() {
  try {
    queryClientRef?.clear()
    resetPrefetchFlag()
  } catch (_) {
    /* ignore */
  }

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LAST_AUTH_USER_ID_KEY)
      localStorage.removeItem(API_AUTH_STORAGE_KEY)
      localStorage.removeItem(ONBOARDING_KEY)
      localStorage.removeItem(SIDEBAR_KEY)
      localStorage.removeItem(STYLE_PERSIST_KEY)
      localStorage.removeItem(PERSONA_PERSIST_KEY)
      removeMilestoneVisitKeys()
    }
  } catch (_) {
    /* ignore */
  }

  useOnboardingStore.getState().clearLocalData()
  useOnboardingStore.getState().load()

  useStyleStore.setState({ selectedStyleId: null, selectedStyle: null })
  usePersonaStore.setState({ selectedPersonaId: null, selectedPersona: null })

  useSidebarStore.setState({
    collapsed: false,
    mobileOpen: false,
    toolsExpanded: false,
    accountDialogOpen: false,
  })

  try {
    useStyleStore.persist?.clearStorage?.()
  } catch (_) {
    /* ignore */
  }
  try {
    usePersonaStore.persist?.clearStorage?.()
  } catch (_) {
    /* ignore */
  }
}
