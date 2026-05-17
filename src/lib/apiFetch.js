/**
 * Centralized API transport.
 *
 * Every `src/api/*.js` module routes through `apiFetch` instead of hand-rolling
 * its own `request()` helper. This guarantees one place for:
 *   - base URL resolution (dev proxy vs prod CloudFront — see lib/env.js)
 *   - Authorization / X-Channel-Id / Idempotency-Key header construction
 *   - the unified error envelope → rich Error object (via parseApiError)
 *   - empty / non-JSON response handling
 *   - AbortSignal threading for long-running calls
 *
 * Error contract: failures throw the SAME rich Error `parseApiError` has
 * always produced (`.status`, `.code`, `.serverMessage`, `.retryAfterMs`,
 * `.feature`, `.body`). `friendlyMessage`, the React Query retry policy
 * (`aiAwareShouldRetry`/`aiAwareRetryDelay`), the QueryClient paywall
 * handler, and every existing catch block keep working unchanged. The
 * `ApiError` class is exported for callers that want `instanceof` checks;
 * `parseApiError`'s product is made an `ApiError` instance so both the
 * legacy duck-typed reads and `instanceof ApiError` succeed.
 */

import { getApiBaseUrl } from './env.js'
import { parseApiError } from './aiErrors.js'
import { useAuthStore } from '../stores/authStore.js'

/**
 * Typed error for API failures. Carries the same fields the rest of the
 * app already reads off `parseApiError`'s result, so it's a drop-in:
 *   - status        HTTP status (0 = network failure)
 *   - code          server error code (or status-derived fallback)
 *   - message       user-friendly message (computed by aiErrors)
 *   - serverMessage raw server message string
 *   - retryAfterMs  ms to wait before retry, or null
 *   - feature       server-provided feature key, or null
 *   - body          raw parsed envelope (debugging / advanced consumers)
 */
export class ApiError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Build a rich error from a failed Response + parsed body. Delegates the
 * heavy lifting to `parseApiError` (single source of truth for the error
 * envelope + friendly-message mapping) and re-homes the result onto an
 * `ApiError` instance so `instanceof ApiError` works without losing any
 * of the duck-typed fields existing code relies on.
 */
function toApiError(response, body) {
  const parsed = parseApiError(response, body)
  const err = new ApiError(parsed.message)
  // Copy every enriched field across (status, code, serverMessage,
  // retryAfterMs, retryAfterSeconds, feature, body, plus any future
  // additions parseApiError grows).
  Object.assign(err, {
    status: parsed.status,
    code: parsed.code,
    serverMessage: parsed.serverMessage,
    retryAfterMs: parsed.retryAfterMs,
    retryAfterSeconds: parsed.retryAfterSeconds,
    feature: parsed.feature,
    body: parsed.body,
  })
  return err
}

/**
 * Core fetch wrapper.
 *
 * @param {string} path                Path beginning with `/api/...`
 * @param {object} [opts]
 * @param {string} [opts.method='GET']
 * @param {*}      [opts.body]         Serialized as JSON unless `rawBody`
 *                                     is set (FormData / Blob pass-through)
 * @param {boolean}[opts.rawBody]      Send `body` as-is; do not JSON-encode
 *                                     and do not set Content-Type (lets the
 *                                     browser set the multipart boundary)
 * @param {string} [opts.token]        Explicit bearer token. When omitted,
 *                                     the valid access token is pulled from
 *                                     the auth store. `null` → no auth header.
 * @param {string} [opts.channelId]    → X-Channel-Id
 * @param {string} [opts.idempotencyKey] → Idempotency-Key
 * @param {AbortSignal} [opts.signal]  Threaded straight into fetch()
 * @param {object} [opts.headers]      Extra headers (override defaults)
 * @param {'json'|'blob'} [opts.responseType='json']
 * @returns {Promise<*>} parsed JSON (or Blob), or null for empty responses
 */
export async function apiFetch(
  path,
  {
    method = 'GET',
    body,
    rawBody = false,
    token,
    channelId,
    idempotencyKey,
    signal,
    headers: extraHeaders = {},
    responseType = 'json',
  } = {}
) {
  // `token === undefined` → resolve from the store. `token === null` →
  // explicitly anonymous (public endpoints like /billing/plans). Any
  // string → use as-is (the API-module signatures pass an explicit token).
  let authToken = token
  if (authToken === undefined) {
    try {
      authToken = await useAuthStore.getState().getValidAccessToken()
    } catch {
      authToken = null
    }
  }

  const headers = {
    ...(rawBody ? {} : { 'Content-Type': 'application/json' }),
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(channelId ? { 'X-Channel-Id': channelId } : {}),
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    ...extraHeaders,
  }

  let res
  try {
    res = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      headers,
      body: body === undefined || body === null ? undefined : rawBody ? body : JSON.stringify(body),
      signal,
    })
  } catch (err) {
    // AbortError must propagate unchanged so callers (poll loop, query
    // cancellation) can distinguish "cancelled" from "server failed".
    if (err?.name === 'AbortError') throw err
    // Network-level failure (DNS/TLS/CORS/offline) never reached the
    // server — synthesize a status-0 response so parseApiError maps it
    // to the friendly "couldn't reach the server" message.
    throw toApiError(
      { status: 0, statusText: err?.message || 'Network error', headers: { get: () => null } },
      null
    )
  }

  const contentType = res.headers.get('Content-Type') || ''
  const isJson = contentType.includes('application/json')

  if (!res.ok) {
    const errorBody = isJson ? await res.json().catch(() => ({})) : {}
    throw toApiError(res, errorBody)
  }

  if (responseType === 'blob') {
    return res.blob()
  }

  // 204 No Content / empty body / non-JSON success → null. Mirrors the
  // old per-module behavior (they returned `{}` for non-JSON; null is
  // cleaner and the callers that care already null-check).
  if (res.status === 204 || !isJson) {
    return null
  }

  return res.json().catch(() => ({}))
}

export { getApiBaseUrl }
