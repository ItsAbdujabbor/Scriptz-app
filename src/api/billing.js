/** Billing / Paddle API client. */
import { apiFetch } from '../lib/apiFetch.js'

function request(method, path, accessToken, body = null, fetchInit = {}) {
  // accessToken is `null` for public endpoints (plans / feature-costs) and
  // a string for authenticated ones. Pass it through verbatim so apiFetch
  // never auto-resolves a token for the public routes. `fetchInit.signal`
  // is threaded through for cancellable calls (e.g. /sync backstop).
  return apiFetch(path, {
    method,
    body: body ?? undefined,
    token: accessToken,
    signal: fetchInit?.signal,
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

export function startCheckout(accessToken, { priceId, successUrl, cancelUrl } = {}) {
  // The server forces skip_trial=True on every checkout — the field is
  // sent for backwards compat with older backend builds but is ignored.
  return request('POST', '/api/billing/checkout', accessToken, {
    price_id: priceId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    skip_trial: true,
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
export function syncSubscription(accessToken, fetchInit = {}) {
  return request('POST', '/api/billing/sync', accessToken, null, fetchInit)
}

export function getPaymentMethod(accessToken) {
  return request('GET', '/api/billing/payment-method', accessToken)
}
