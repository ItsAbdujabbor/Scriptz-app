/**
 * Global paywall interceptor.
 *
 * Wraps window.fetch once. When any request returns HTTP 402 with one
 * of the recognised paywall codes:
 *
 *   * NO_ACTIVE_SUBSCRIPTION  — the user hit a premium-only feature
 *                               (Persona / Styles / Edit / Score /
 *                               One-click fix / Max model) without a
 *                               paid plan.
 *   * INSUFFICIENT_CREDITS    — a credit-deductible feature
 *                               (Generate / Recreate / Analyze /
 *                               Titles) was hit but the user ran out
 *                               of credits.
 *
 * Both cases redirect to /pro with distinct analytics events so we
 * can tell upgrade-intent (premium gate) from upsell-intent (credit
 * exhaustion) in dashboards. The redirect is silent — no red banner.
 */

import { track } from './analytics'
import { openCreditsModal } from './creditsModalBus'

let installed = false

// Codes that route the user to /pro. PLAN_UPGRADE_REQUIRED is the
// 403 raised by `require_plan_feature(...)` when a user IS
// subscribed but their tier doesn't include the requested feature
// (e.g., Starter trying to use Personas / Styles / Edit / Score /
// One-click fix — all Creator-or-Ultimate only). Without it in this
// set, the persona/style modal mutation throws an unhandled error
// and the user sees a generic "Generation failed" red toast instead
// of being routed to /pro.
const PAYWALL_CODES = new Set([
  'NO_ACTIVE_SUBSCRIPTION',
  'INSUFFICIENT_CREDITS',
  'PLAN_UPGRADE_REQUIRED',
])

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
      if (code && PAYWALL_CODES.has(code)) {
        try {
          const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || ''
          const event = code === 'INSUFFICIENT_CREDITS' ? 'credits_exhausted' : 'paywall_view'
          track(event, { feature_path: new URL(url, window.location.origin).pathname })
        } catch {}
        if (code === 'INSUFFICIENT_CREDITS') {
          // Out of credits — open the credit marketplace so they can top up.
          openCreditsModal()
        } else {
          // No subscription or wrong plan tier — send to the pricing/upgrade screen.
          goToPricing()
        }
        return makeSilentResponse()
      }
    } catch {
      // fall through; the original response stays intact
    }
    return response
  }
  installed = true
}
