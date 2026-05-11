/**
 * Product analytics SDK — client side.
 *
 * - Stable anonymous_id in localStorage (uuid v4, per browser).
 * - Session id resets after 30 min of inactivity.
 * - Batches events; flushes every 5s, on size threshold, or on pagehide.
 * - POSTs to `/api/events`. Backend is fire-and-forget — failures are dropped
 *   on the floor on purpose; never break the app.
 */

const STORAGE_ANON = 'clixa_anon_id'
const STORAGE_SESSION = 'clixa_session'
const SESSION_TTL_MS = 30 * 60 * 1000
const FLUSH_INTERVAL_MS = 5000
const FLUSH_SIZE = 20
const MAX_BATCH = 50
const MAX_QUEUE = 500

function safeRead(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function safeWrite(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {}
}

function ensureAnonymousId() {
  let id = safeRead(STORAGE_ANON)
  if (!id) {
    id =
      (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
      String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10)
    safeWrite(STORAGE_ANON, id)
  }
  return id
}

function ensureSession() {
  const now = Date.now()
  try {
    const raw = safeRead(STORAGE_SESSION)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.id && parsed?.last && now - parsed.last < SESSION_TTL_MS) {
        parsed.last = now
        safeWrite(STORAGE_SESSION, JSON.stringify(parsed))
        return parsed.id
      }
    }
  } catch {}
  const id =
    (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
    `s-${now}-${Math.random().toString(36).slice(2, 8)}`
  safeWrite(STORAGE_SESSION, JSON.stringify({ id, last: now }))
  return id
}

const queue = []
let flushTimer = null
let identity = { user_id: null }
let baseUrl = ''

function getEndpoint() {
  const base = (baseUrl || '').replace(/\/+$/, '')
  return `${base}/api/events`
}

async function flush() {
  if (queue.length === 0) return
  const batch = queue.splice(0, MAX_BATCH)
  const body = JSON.stringify({ events: batch })
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' })
      navigator.sendBeacon(getEndpoint(), blob)
    } else {
      await fetch(getEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      })
    }
  } catch {
    // intentional: never bubble up analytics failures
  }
}

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flush()
  }, FLUSH_INTERVAL_MS)
}

export function initAnalytics({ apiBaseUrl } = {}) {
  if (typeof window === 'undefined') return
  baseUrl = apiBaseUrl || ''
  ensureAnonymousId()
  ensureSession()

  // Flush on page hide / before unload so we don't lose the last events.
  const finalFlush = () => {
    if (queue.length) flush()
  }
  window.addEventListener('pagehide', finalFlush)
  window.addEventListener('beforeunload', finalFlush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') finalFlush()
  })
}

export function identify(user) {
  if (!user) {
    identity = { user_id: null }
    return
  }
  identity = { user_id: String(user.id ?? '') || null }
}

export function track(event_name, properties = {}) {
  if (typeof window === 'undefined' || !event_name) return
  if (queue.length >= MAX_QUEUE) queue.shift() // drop oldest under load
  queue.push({
    event_name: String(event_name).slice(0, 64),
    occurred_at: new Date().toISOString(),
    anonymous_id: ensureAnonymousId(),
    session_id: ensureSession(),
    user_id: identity.user_id,
    source: 'web_app',
    properties: properties && typeof properties === 'object' ? properties : {},
    url: window.location.href,
    referrer: document.referrer || null,
    experiment_key: properties?.__exp_key || null,
    variant: properties?.__exp_variant || null,
  })
  if (queue.length >= FLUSH_SIZE) flush()
  else scheduleFlush()
}

export function trackPageView(extra = {}) {
  track('page_view', {
    path: window.location.pathname + window.location.search,
    title: document.title,
    ...extra,
  })
}

/**
 * Read an A/B test variant for the current visitor. Fire-and-forget — returns
 * null if not assigned or not running. Caches the answer for the session.
 */
const variantCache = new Map()
export async function getExperimentVariant(key) {
  if (!key) return null
  if (variantCache.has(key)) return variantCache.get(key)
  const anon = ensureAnonymousId()
  try {
    const base = (baseUrl || '').replace(/\/+$/, '')
    const url = `${base}/api/experiments/${encodeURIComponent(key)}?anonymous_id=${encodeURIComponent(anon)}`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) {
      variantCache.set(key, null)
      return null
    }
    const data = await res.json()
    const variant = data?.variant ?? null
    variantCache.set(key, variant)
    return variant
  } catch {
    variantCache.set(key, null)
    return null
  }
}
