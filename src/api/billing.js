/** Billing / Paddle API client. */
import { getApiBaseUrl } from '../lib/env.js'
import { parseApiError } from '../lib/aiErrors.js'

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
      // Rich error with status / code / retryAfterMs — see lib/aiErrors.
      // Frontend mappers and React Query retry logic both read these
      // structured fields without parsing the message string.
      throw parseApiError(res, data)
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
 * End the user's free trial early. Bills immediately via Paddle and the
 * webhook then flips status `trialing → active`, granting the full plan
 * credits (vs. the 100-credit trial amount).
 */
export function skipTrial(accessToken) {
  return request('POST', '/api/billing/skip-trial', accessToken)
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

/**
 * Force the backend to reconcile the user's subscription state DIRECTLY
 * from Paddle (skipping the webhook). The backend's `/api/billing/sync`
 * endpoint pulls current state from `PaddleClient.list_subscriptions_for_customer`
 * and upserts the local `subscriptions` row.
 *
 * Frontend backstop: called when the 60-s activation burst times out
 * with the subscription still in an inactive state. Webhooks are usually
 * sub-second but Paddle outages or our own queue backlogs can blow past
 * 60s — at that point the user has paid and is sitting on stale UI.
 * `/sync` closes that gap.
 *
 * Returns the freshly-reconciled SubscriptionOut (same shape as
 * `getSubscription`).
 */
export function syncSubscription(accessToken) {
  return request('POST', '/api/billing/sync', accessToken)
}
