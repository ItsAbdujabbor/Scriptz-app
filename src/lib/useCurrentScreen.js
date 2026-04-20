import { useSyncExternalStore } from 'react'

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
  if (h === 'thumbnails' || h.startsWith('thumbnails/') || h.startsWith('thumbnails?'))
    return 'thumbnails'
  if (h === 'optimize') return 'optimize'
  if (h === 'pro') return 'pro'
  if (h === 'ab-testing' || h.startsWith('ab-testing/')) return 'ab-testing'
  if (h === 'billing') return 'billing'
  return 'dashboard'
}

let _cached = null

function getSnapshot() {
  const screen = getScreenFromHash()
  if (_cached && _cached.currentScreen === screen) return _cached
  _cached = { currentScreen: screen }
  return _cached
}

function subscribe(cb) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

/**
 * Derives current screen from the hash. Re-renders only when the screen
 * actually changes.
 */
export function useCurrentScreen() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
