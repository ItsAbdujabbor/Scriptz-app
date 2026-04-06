import { useSyncExternalStore } from 'react'
import { getCoachHashState } from './coachHashRoute'

function normalizeHashRoute(hashValue) {
  return String(hashValue || '')
    .replace(/^#/, '')
    .replace(/^\/+/, '')
    .split('?')[0]
    .trim()
}

function getScreenFromHash() {
  const h = normalizeHashRoute(typeof window !== 'undefined' ? window.location.hash : '')
  if (h === 'dashboard') return 'dashboard'
  if (h === 'coach' || h.startsWith('coach/')) return 'coach'
  if (h === 'optimize') return 'optimize'
  if (h === 'pro') return 'pro'
  if (h === 'library' || h === 'templates') return 'templates'
  return 'dashboard'
}

let _cached = null

function getSnapshot() {
  const screen = getScreenFromHash()
  const coach = screen === 'coach' ? getCoachHashState() : null
  const key = `${screen}|${coach?.activeTab ?? ''}|${coach?.coachConversationId ?? ''}|${coach?.scriptConversationId ?? ''}|${coach?.thumbnailConversationId ?? ''}`
  if (_cached && _cached._key === key) return _cached
  _cached = {
    _key: key,
    currentScreen: screen,
    activeTab: coach?.activeTab ?? 'coach',
    activeConversationId: coach?.coachConversationId ?? null,
    activeScriptConversationId: coach?.scriptConversationId ?? null,
    activeThumbnailConversationId: coach?.thumbnailConversationId ?? null,
  }
  return _cached
}

function subscribe(cb) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

/**
 * Derives current screen + coach state from the hash.
 * Re-renders only when the derived values actually change.
 */
export function useCurrentScreen() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
