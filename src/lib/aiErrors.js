/**
 * Shared error parsing + user-facing message mapper for the API.
 *
 * The backend emits a unified error envelope through ``app/core/errors.py``:
 *
 *   {
 *     error: {
 *       code: "RATE_LIMITED" | "PROVIDER_UNAVAILABLE" | "INSUFFICIENT_CREDITS" | ...,
 *       message: "human-readable string from server",
 *       request_id: "...",
 *       retry_after_seconds: 30,   // promoted top-level when applicable
 *       extra: { feature: "title_generate_3", ... }   // route-specific
 *     }
 *   }
 *
 * Plus a ``Retry-After`` HTTP header for 429 / 503 responses.
 *
 * This module turns that into a normalised JS Error object every caller
 * can switch on, and produces a friendly user-facing string for any UI
 * surface (toast, inline notice, modal banner). One source of truth so
 * the same network failure shows the same message wherever it appears.
 */

/**
 * Parse a fetch Response + optional already-parsed body into a rich
 * Error object. Always returns an Error subclass that includes:
 *   - status: HTTP status code
 *   - code: server-side error code (or "ERROR" fallback)
 *   - message: user-friendly message (computed)
 *   - retryAfterMs: milliseconds to wait before retry, or null
 *   - feature: server-provided feature key, or null
 *   - serverMessage: raw message string from the server
 *
 * Safe to call even when the response is malformed or non-JSON; the
 * defaults are sensible.
 */
export function parseApiError(response, body) {
  const status = response?.status ?? 0
  const env = body?.error || {}
  // Legacy shapes some routes still emit: {detail: "..."} or {detail: {...}}
  const legacyDetail = body?.detail
  const legacyDetailDict = legacyDetail && typeof legacyDetail === 'object' ? legacyDetail : null

  const code = env.code || legacyDetailDict?.code || statusToFallbackCode(status) || 'ERROR'

  const serverMessage =
    env.message ||
    (typeof legacyDetail === 'string' ? legacyDetail : null) ||
    legacyDetailDict?.message ||
    response?.statusText ||
    'Request failed'

  // retry_after_seconds: header > envelope top-level > envelope.extra
  const headerRetry = parseRetryAfterHeader(response?.headers?.get?.('Retry-After'))
  const envRetry = typeof env.retry_after_seconds === 'number' ? env.retry_after_seconds : null
  const extraRetry =
    typeof env?.extra?.retry_after_seconds === 'number' ? env.extra.retry_after_seconds : null
  const retryAfterSeconds = headerRetry ?? envRetry ?? extraRetry ?? null

  const feature = env?.extra?.feature || legacyDetailDict?.feature || null

  const err = new Error(friendlyMessageFor({ code, status, serverMessage, retryAfterSeconds }))
  err.status = status
  err.code = code
  err.serverMessage = serverMessage
  err.retryAfterMs = retryAfterSeconds != null ? retryAfterSeconds * 1000 : null
  err.retryAfterSeconds = retryAfterSeconds
  err.feature = feature
  // Keep the structured body around for debugging / advanced consumers.
  err.body = body
  return err
}

/**
 * Compute a friendly user-facing string for an error. Prefers the code
 * over the raw server message because the server's text might be
 * developer-shaped (e.g. "OpenAI quota exceeded: ..."). When the code
 * is unrecognised, falls back to the server message — that's better
 * than a generic "something went wrong".
 */
export function friendlyMessage(error) {
  if (!error) return 'Something went wrong. Please try again.'
  return friendlyMessageFor({
    code: error.code,
    status: error.status,
    serverMessage: error.serverMessage || error.message,
    retryAfterSeconds: error.retryAfterSeconds,
  })
}

function friendlyMessageFor({ code, status, serverMessage, retryAfterSeconds }) {
  const retryHint =
    retryAfterSeconds && retryAfterSeconds > 0
      ? ` Try again in ${humanizeSeconds(retryAfterSeconds)}.`
      : ''

  // Heuristic: catch upstream-billing wording even when the code came
  // through as a generic PROVIDER_ERROR or 5xx. OpenAI surfaces these
  // as messages like "You exceeded your current quota" / "billing
  // hard limit reached" / "insufficient_quota" — we don't want to
  // expose any of that to the user.
  const lowered = (serverMessage || '').toLowerCase()
  const looksLikeProviderBilling =
    lowered.includes('quota') ||
    lowered.includes('billing') ||
    lowered.includes('insufficient_quota') ||
    lowered.includes('hard limit')

  switch (code) {
    case 'RATE_LIMITED':
      return `We're a bit busy right now.${retryHint || ' Please give it a moment and try again.'} Thanks for your patience.`
    case 'PROVIDER_UNAVAILABLE':
      return `We're having a temporary issue on our end.${retryHint || ' Please try again in a moment.'} Thanks for bearing with us.`
    case 'PROVIDER_ERROR':
      if (looksLikeProviderBilling) {
        return "We're having trouble connecting to our AI provider right now. We're on it — please try again shortly. Thanks for your patience."
      }
      return 'Something hiccupped on our end. Please try again — we appreciate your patience.'
    case 'CONTENT_BLOCKED':
      return 'This prompt or image was blocked by safety filters. Try rewording or using a different reference.'
    case 'INSUFFICIENT_CREDITS':
      return "You're out of credits for now. Add a top-up or wait for your monthly renewal."
    case 'NO_ACTIVE_SUBSCRIPTION':
      return 'Start your free trial or subscribe to use this feature.'
    case 'PLAN_UPGRADE_REQUIRED':
      return 'This feature is on a higher plan. Upgrade to unlock it.'
    case 'IDEMPOTENT_REQUEST_IN_PROGRESS':
      return 'Already working on that one — hang tight a second.'
    case 'BAD_REQUEST':
    case 'VALIDATION_ERROR':
      // Server messages here are usually specific + actionable
      // (e.g. "title too long"). Surface them directly.
      return serverMessage || 'That input looks off — please double-check and try again.'
    case 'UNAUTHORIZED':
    case 'TOKEN_EXPIRED':
      return 'Your session expired. Please reload and sign in again.'
    case 'FORBIDDEN':
      return "You don't have permission to do that."
    case 'NOT_FOUND':
      return "We couldn't find that. It may have been removed."
    case 'CONFLICT':
      return serverMessage || 'That action conflicts with the current state. Try again.'
    case 'TIMEOUT':
      return 'That took longer than expected. Please try again — sorry for the wait.'
    default: {
      // Catch upstream-billing wording even when there's no specific code.
      if (looksLikeProviderBilling) {
        return "We're having trouble connecting to our AI provider right now. We're on it — please try again shortly. Thanks for your patience."
      }
      if (status >= 500) {
        return "Something on our side broke. We're looking into it — please try again. Thanks for your patience."
      }
      if (status === 0) {
        return "Looks like there's a network issue. Check your connection and try again."
      }
      // Last resort — surface the server message only if it's short and
      // doesn't look like internal/debug noise.
      if (
        typeof serverMessage === 'string' &&
        serverMessage.length < 200 &&
        !/openai|gemini|gpt|claude|anthropic|stack|trace|exception/i.test(serverMessage)
      ) {
        return serverMessage
      }
      return 'Something went wrong. Please try again — thanks for your patience.'
    }
  }
}

/**
 * React Query retry-delay hook.
 *
 * Returns ms to wait before the next retry. Honors server's Retry-After
 * if present (clamped to a sane maximum so a misconfigured server can't
 * make our queries hang for hours), otherwise falls back to exponential
 * backoff with jitter.
 *
 * Use as ``retryDelay: aiAwareRetryDelay`` in QueryClient defaults.
 */
export function aiAwareRetryDelay(failureCount, error) {
  const serverHint = error?.retryAfterMs
  if (typeof serverHint === 'number' && serverHint > 0) {
    // Clamp 1 minute max — at most a single retry honors the server hint.
    // Past that, the user is staring at a stuck UI; better to surface
    // failure than to keep waiting silently.
    return Math.min(serverHint, 60_000)
  }
  // Exponential backoff: 500ms, 1s, 2s ... up to 8s, plus jitter to
  // avoid thundering herd when many tabs retry simultaneously.
  const base = Math.min(8_000, 500 * 2 ** failureCount)
  const jitter = Math.random() * 250
  return base + jitter
}

/**
 * Should this error be retried? Default: yes for 429 / 5xx / network
 * (status 0); no for 4xx (client error — retrying same input fails the
 * same way). Plug into ``retry: aiAwareShouldRetry`` in RQ defaults.
 */
export function aiAwareShouldRetry(failureCount, error) {
  if (failureCount >= 2) return false // hard cap — never more than 2 retries
  const s = error?.status ?? 0
  if (s === 401 || s === 403 || s === 404) return false // auth/perm/missing
  if (s === 402) return false // payment required — credits won't appear by retrying
  if (s === 400 || s === 422) return false // bad input
  if (s === 409) {
    // Idempotency in-progress (the only 409 we currently emit from AI
    // routes) — a single retry is correct and lets the cached response
    // come through.
    return failureCount < 1
  }
  return true
}

// ─────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────

function statusToFallbackCode(status) {
  const map = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    402: 'PAYMENT_REQUIRED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'VALIDATION_ERROR',
    429: 'RATE_LIMITED',
    500: 'INTERNAL_ERROR',
    502: 'BAD_GATEWAY',
    503: 'SERVICE_UNAVAILABLE',
  }
  return map[status]
}

function parseRetryAfterHeader(raw) {
  if (!raw) return null
  // RFC 7231 says Retry-After is either delta-seconds or HTTP-date.
  // We only support seconds — the server only emits seconds.
  const n = Number(raw)
  if (!isNaN(n) && n >= 0) return Math.floor(n)
  return null
}

function humanizeSeconds(s) {
  if (s < 5) return 'a moment'
  if (s < 60) return `${s} seconds`
  const m = Math.round(s / 60)
  return `${m} minute${m === 1 ? '' : 's'}`
}
