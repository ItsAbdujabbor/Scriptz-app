/**
 * Persistent cache for AI-scored video data on the dashboard's
 * "SEO improvement ideas" grid. Scoring is expensive but the inputs
 * (title, description, tags, view/like/comment counts, thumbnail) only
 * change when the user (or YouTube's stats) actually change them — so
 * we fingerprint the inputs and re-score only when that fingerprint
 * differs from the cached one.
 *
 * Implementation notes (production hardening):
 *   - One parse of localStorage per session (`memoryMirror`); reads on
 *     subsequent renders are cheap object lookups.
 *   - Writes are coalesced inside a microtask so a wave of N saves
 *     produces one localStorage.setItem instead of N.
 *   - The store is namespaced per user ID so switching accounts on a
 *     shared device never reads the wrong data.
 *   - Quota / corruption / private-mode failures degrade gracefully:
 *     an in-memory cache still works, the page just re-scores on the
 *     next reload.
 *   - Each entry's shape is validated on read; bad/legacy entries are
 *     ignored rather than crashing a render.
 */

const STORAGE_PREFIX = 'scriptz:videoScoreCache:v1'
const MAX_ENTRIES = 200
const ANON = '__anon__'

let activeUserId = ANON
let memoryMirror = null
let mirrorOwner = null
let pendingWrite = false

function storageKey(userId) {
  return `${STORAGE_PREFIX}:${userId || ANON}`
}

function isPlainObject(x) {
  return x != null && typeof x === 'object' && !Array.isArray(x)
}

function isValidEntry(entry) {
  return (
    isPlainObject(entry) &&
    typeof entry.fp === 'string' &&
    typeof entry.t === 'number' &&
    isPlainObject(entry.data)
  )
}

function loadMirror(userId) {
  if (mirrorOwner === userId && memoryMirror) return memoryMirror
  let map = {}
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(storageKey(userId))
      if (raw) {
        const parsed = JSON.parse(raw)
        if (isPlainObject(parsed)) {
          for (const [id, entry] of Object.entries(parsed)) {
            if (isValidEntry(entry)) map[id] = entry
          }
        }
      }
    } catch {
      map = {}
    }
  }
  memoryMirror = map
  mirrorOwner = userId
  return map
}

function flush() {
  pendingWrite = false
  if (typeof localStorage === 'undefined' || mirrorOwner == null) return
  try {
    localStorage.setItem(storageKey(mirrorOwner), JSON.stringify(memoryMirror || {}))
  } catch {
    // Quota / private mode — keep in-memory mirror, drop persistence.
  }
}

function scheduleFlush() {
  if (pendingWrite) return
  pendingWrite = true
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(flush)
  } else {
    Promise.resolve().then(flush)
  }
}

/**
 * Set or change the user the cache belongs to. Call this once at sign-in
 * (and again at sign-out with `null`). Switching invalidates the mirror
 * so the next read parses the new user's slot from localStorage.
 */
export function setVideoScoreCacheUser(userId) {
  const next = userId || ANON
  if (next === activeUserId) return
  if (pendingWrite) flush()
  activeUserId = next
  memoryMirror = null
  mirrorOwner = null
}

/** Stable string derived from the inputs the scoring API consumes.
 *  Any change here causes a queryKey change → cache miss → re-fetch. */
export function videoScoreFingerprint(v) {
  if (!v || !v.id) return null
  return [
    v.id,
    (v.title || '').length,
    (v.description || '').length,
    Array.isArray(v.tags) ? v.tags.length : 0,
    Number(v.view_count ?? 0),
    Number(v.like_count ?? 0),
    Number(v.comment_count ?? 0),
    v.thumbnail_url || '',
  ].join('|')
}

export function loadScore(videoId, fingerprint) {
  if (!videoId || !fingerprint) return undefined
  const map = loadMirror(activeUserId)
  const entry = map[videoId]
  if (!entry || entry.fp !== fingerprint) return undefined
  return entry.data
}

export function loadScoreUpdatedAt(videoId, fingerprint) {
  if (!videoId || !fingerprint) return undefined
  const map = loadMirror(activeUserId)
  const entry = map[videoId]
  if (!entry || entry.fp !== fingerprint) return undefined
  return entry.t
}

export function saveScore(videoId, fingerprint, data) {
  if (!videoId || !fingerprint || !isPlainObject(data)) return
  const map = loadMirror(activeUserId)
  map[videoId] = { fp: fingerprint, data, t: Date.now() }
  const keys = Object.keys(map)
  if (keys.length > MAX_ENTRIES) {
    keys.sort((a, b) => (map[a].t || 0) - (map[b].t || 0))
    keys.slice(0, keys.length - MAX_ENTRIES).forEach((k) => delete map[k])
  }
  scheduleFlush()
}

/** Wipe everything for the current user. Call on hard sign-out. */
export function clearVideoScoreCache() {
  memoryMirror = {}
  mirrorOwner = activeUserId
  scheduleFlush()
}
