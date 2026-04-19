/** Billing / Paddle API client. */
import { getApiBaseUrl } from '../lib/env.js'

function request(method, path, accessToken, body = null) {
  const url = getApiBaseUrl() + path
  const headers = { 'Content-Type': 'application/json' }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  const opts = { method, headers }
  if (body != null) opts.body = JSON.stringify(body)

  return fetch(url, opts).then(async (res) => {
    const ct = res.headers.get('Content-Type') || ''
    const data = ct.includes('application/json') ? await res.json().catch(() => ({})) : {}
    if (!res.ok) {
      const msg = data?.detail || data?.message || res.statusText
      const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
      err.status = res.status
      err.payload = data
      throw err
    }
    return data
  })
}

export function getPlans() {
  return request('GET', '/api/billing/plans', null)
}

/** Public map `{feature_key: credits_per_call}` used by UI cost labels. */
export function getFeatureCosts() {
  return request('GET', '/api/billing/feature-costs', null)
}

export function getSubscription(accessToken) {
  return request('GET', '/api/billing/subscription', accessToken)
}

export function getCredits(accessToken) {
  return request('GET', '/api/billing/credits', accessToken)
}

export function getLedger(accessToken, { limit = 50, beforeId = null } = {}) {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  if (beforeId != null) params.set('before_id', String(beforeId))
  return request('GET', `/api/billing/ledger?${params.toString()}`, accessToken)
}

export function startCheckout(accessToken, { priceId, successUrl, cancelUrl, skipTrial } = {}) {
  return request('POST', '/api/billing/checkout', accessToken, {
    price_id: priceId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    skip_trial: !!skipTrial,
  })
}

export function cancelSubscription(accessToken) {
  return request('POST', '/api/billing/cancel', accessToken)
}

/**
 * Upgrade or downgrade the user's active subscription to a different plan.
 * Pass either a plan_slug (e.g. "creator_annual") or a Paddle price_id.
 * timing: "immediate" (default — prorate now) or "next_period".
 */
export function changePlan(accessToken, { planSlug, priceId, timing = 'immediate' } = {}) {
  return request('POST', '/api/billing/change-plan', accessToken, {
    plan_slug: planSlug,
    price_id: priceId,
    timing,
  })
}
