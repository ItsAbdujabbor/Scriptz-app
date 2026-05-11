/**
 * Clear client-side caches when the signed-in user changes or logs out.
 * Without this, React Query + localStorage show the previous account's data.
 */

import { useOnboardingStore } from '../stores/onboardingStore'
import { usePersonaStore } from '../stores/personaStore'
import { useStyleStore } from '../stores/styleStore'
import { useSidebarStore } from '../stores/sidebarStore'
import { resetPrefetchFlag } from './query/prefetchHistoryConversations'
import { resetSubscriptionPrefetchFlag } from './query/prefetchSubscription'
import { resetCreditsPrefetchFlag } from '../queries/billing/creditsQueries'
import { clearSubscriptionCache } from './query/subscriptionCache'
import { API_AUTH_STORAGE_KEY } from './authMode'

let queryClientRef = null

export function setAppQueryClient(client) {
  queryClientRef = client
}

/**
 * Read the app-wide QueryClient from outside React (e.g. transport-layer
 * helpers in `src/api/*` that need to invalidate cache during a long-
 * running async flow). Returns null before `main.jsx` has finished
 * bootstrapping — callers must no-op in that case.
 */
export function getAppQueryClient() {
  return queryClientRef
}

/** Set when a session exists; used to detect account switches. */
export const LAST_AUTH_USER_ID_KEY = 'clixa_last_auth_user_id'

const ONBOARDING_KEY = 'clixa_onboarding'
const SIDEBAR_KEY = 'clixa_sidebar_ui'
const PERSONA_PERSIST_KEY = 'clixa_selected_persona'
const STYLE_PERSIST_KEY = 'clixa_selected_style'
const MILESTONE_PREFIX = 'clixa-milestone-visit-v1:'

// Legacy "scriptz_*" brand keys. Cleared alongside the new keys on user
// switch / data delete so stale rebrand-era data doesn't leak across
// accounts on a shared device. Per-store reads also handle the one-shot
// migration; this is the cleanup half of the same shim.
const LEGACY_LAST_AUTH_USER_ID_KEY = 'scriptz_last_auth_user_id'
const LEGACY_ONBOARDING_KEY = 'scriptz_onboarding'
const LEGACY_SIDEBAR_KEY = 'scriptz_sidebar_ui'
const LEGACY_PERSONA_PERSIST_KEY = 'scriptz_selected_persona'
const LEGACY_STYLE_PERSIST_KEY = 'scriptz_selected_style'
const LEGACY_MILESTONE_PREFIX = 'scriptz-milestone-visit-v1:'

// One-shot migration: on first import, copy any legacy account-switch
// marker into the new key so we don't mistake the migrated user for a
// fresh one (which would reset every cache below).
try {
  if (typeof localStorage !== 'undefined') {
    if (!localStorage.getItem(LAST_AUTH_USER_ID_KEY)) {
      const legacy = localStorage.getItem(LEGACY_LAST_AUTH_USER_ID_KEY)
      if (legacy) localStorage.setItem(LAST_AUTH_USER_ID_KEY, legacy)
    }
    localStorage.removeItem(LEGACY_LAST_AUTH_USER_ID_KEY)
  }
} catch {
  /* ignore */
}

function removeMilestoneVisitKeys() {
  if (typeof localStorage === 'undefined') return
  const keys = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && (k.startsWith(MILESTONE_PREFIX) || k.startsWith(LEGACY_MILESTONE_PREFIX))) keys.push(k)
  }
  keys.forEach((k) => localStorage.removeItem(k))
}

/**
 * Clear cached user data (React Query entries + persona/style stores +
 * onboarding preferences + sidebar UI + milestone visits) WITHOUT
 * touching the auth session. Called after "Delete my data" so the user
 * sees a truly blank slate on the next render — no stale thumbnails,
 * experiments, personas, or chat histories — while staying signed in.
 */
export function resetClientCachesForDataDelete() {
  try {
    queryClientRef?.clear()
    resetPrefetchFlag()
    resetSubscriptionPrefetchFlag()
    resetCreditsPrefetchFlag()
    clearSubscriptionCache()
  } catch (_) {
    /* ignore */
  }

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(ONBOARDING_KEY)
      localStorage.removeItem(SIDEBAR_KEY)
      localStorage.removeItem(PERSONA_PERSIST_KEY)
      localStorage.removeItem(STYLE_PERSIST_KEY)
      // Defensive: also clear legacy "scriptz_*" keys in case the per-store
      // migration shim hasn't run yet for this session.
      localStorage.removeItem(LEGACY_ONBOARDING_KEY)
      localStorage.removeItem(LEGACY_SIDEBAR_KEY)
      localStorage.removeItem(LEGACY_PERSONA_PERSIST_KEY)
      localStorage.removeItem(LEGACY_STYLE_PERSIST_KEY)
      removeMilestoneVisitKeys()
    }
  } catch (_) {
    /* ignore */
  }

  useOnboardingStore.getState().clearLocalData()

  useSidebarStore.setState({
    collapsed: false,
    mobileOpen: false,
    toolsExpanded: false,
    accountDialogOpen: false,
  })

  try {
    usePersonaStore.setState({ selectedPersonaId: null, selectedPersona: null })
    usePersonaStore.persist?.clearStorage?.()
  } catch (_) {
    /* ignore */
  }
  try {
    useStyleStore.setState({ selectedStyleId: null, selectedStyle: null })
    useStyleStore.persist?.clearStorage?.()
  } catch (_) {
    /* ignore */
  }
}

/**
 * Clear TanStack Query cache and all user-scoped persisted UI state.
 * Keeps theme (clixa_theme) intact. Cognito tokens are wiped via
 * clearTokens() in the auth store before this runs.
 */
export function resetClientCachesForUserChange() {
  try {
    queryClientRef?.clear()
    resetPrefetchFlag()
    resetSubscriptionPrefetchFlag()
    resetCreditsPrefetchFlag()
    clearSubscriptionCache()
  } catch (_) {
    /* ignore */
  }

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LAST_AUTH_USER_ID_KEY)
      localStorage.removeItem(API_AUTH_STORAGE_KEY)
      localStorage.removeItem(ONBOARDING_KEY)
      localStorage.removeItem(SIDEBAR_KEY)
      localStorage.removeItem(PERSONA_PERSIST_KEY)
      localStorage.removeItem(STYLE_PERSIST_KEY)
      // Defensive: also clear legacy "scriptz_*" keys.
      localStorage.removeItem(LEGACY_LAST_AUTH_USER_ID_KEY)
      localStorage.removeItem(LEGACY_ONBOARDING_KEY)
      localStorage.removeItem(LEGACY_SIDEBAR_KEY)
      localStorage.removeItem(LEGACY_PERSONA_PERSIST_KEY)
      localStorage.removeItem(LEGACY_STYLE_PERSIST_KEY)
      removeMilestoneVisitKeys()
    }
  } catch (_) {
    /* ignore */
  }

  useOnboardingStore.getState().clearLocalData()
  useOnboardingStore.getState().load()

  useSidebarStore.setState({
    collapsed: false,
    mobileOpen: false,
    toolsExpanded: false,
    accountDialogOpen: false,
  })

  try {
    usePersonaStore.setState({ selectedPersonaId: null, selectedPersona: null })
    usePersonaStore.persist?.clearStorage?.()
  } catch (_) {
    /* ignore */
  }
  try {
    useStyleStore.setState({ selectedStyleId: null, selectedStyle: null })
    useStyleStore.persist?.clearStorage?.()
  } catch (_) {
    /* ignore */
  }
}
