/**
 * Global paywall interceptor.
 *
 * Wraps window.fetch once. When any request returns HTTP 402 with
 * error.code === "NO_ACTIVE_SUBSCRIPTION":
 *   1. Immediately navigates the SPA to the pricing screen (#pro).
 *   2. Returns a fake `Response` that looks like a cancelled request, so
 *      downstream `.then(res => res.ok ? ... : throw)` branches simply
 *      resolve to `null` / empty state without rendering any error UI.
 *
 * This keeps the UX clean — the user never sees a red "Start your free
 * trial" error banner; they just land on the pricing page.
 */

let installed = false

const PAYWALL_CODE = 'NO_ACTIVE_SUBSCRIPTION'

function goToPricing() {
  if (typeof window === 'undefined') return
  const current = (window.location.hash || '').replace(/^#/, '')
  if (current.startsWith('pro')) return
  window.location.hash = 'pro'
}

function makeSilentResponse() {
  // Anything reading this as JSON gets `null`. Anything checking `res.ok`
  // sees true so nothing else throws. Callers treat `null` as empty/no-op.
  return new Response('null', {
    status: 200,
    statusText: 'OK',
    headers: { 'Content-Type': 'application/json' },
  })
}

export function installPaywallInterceptor() {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (...args) => {
    const response = await originalFetch(...args)
    if (response.status !== 402) return response
    // Peek body without consuming the original — clone first.
    try {
      const cloned = response.clone()
      const body = await cloned.json().catch(() => null)
      const code = body?.error?.code || body?.detail?.code || body?.code || null
      if (code === PAYWALL_CODE) {
        goToPricing()
        return makeSilentResponse()
      }
    } catch {
      // fall through; the original response stays intact
    }
    return response
  }
  installed = true
}
