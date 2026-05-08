import { useSyncExternalStore } from 'react'

function normalizeHashRoute(hashValue) {
  return String(hashValue || '')
    .replace(/^#/, '')
    .replace(/^\/+/, '')
    .split('?')[0]
    .trim()
}

function rawHash() {
  return typeof window !== 'undefined' ? window.location.hash : ''
}

function getScreenFromHash() {
  const h = normalizeHashRoute(rawHash())
  if (h === 'dashboard') return 'dashboard'
  if (h === 'thumbnails' || h.startsWith('thumbnails/') || h.startsWith('thumbnails?'))
    return 'thumbnails'
  if (h === 'optimize') return 'optimize'
  if (h === 'pro') return 'pro'
  if (h === 'billing' || h.startsWith('billing/') || h.startsWith('billing?')) return 'billing'
  return 'dashboard'
}

function getThumbnailConversationIdFromHash() {
  const raw = String(rawHash() || '')
    .replace(/^#/, '')
    .replace(/^\/+/, '')
    .trim()
  if (!raw.startsWith('thumbnails')) return null
  const qIndex = raw.indexOf('?')
  if (qIndex === -1) return null
  const params = new URLSearchParams(raw.slice(qIndex + 1))
  const id = params.get('id')
  if (!id) return null
  const n = Number(id)
  return Number.isFinite(n) ? n : null
}

let _cached = null

function getSnapshot() {
  const screen = getScreenFromHash()
  const thumbnailConversationId = getThumbnailConversationIdFromHash()
  if (
    _cached
    && _cached.currentScreen === screen
    && _cached.thumbnailConversationId === thumbnailConversationId
  ) {
    return _cached
  }
  _cached = { currentScreen: screen, thumbnailConversationId }
  return _cached
}

function subscribe(cb) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

/**
 * Derives current screen + active thumbnail conversation id from the
 * URL hash. Re-renders only when one of those changes (referentially
 * stable snapshot when the hash is unchanged).
 */
export function useCurrentScreen() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
