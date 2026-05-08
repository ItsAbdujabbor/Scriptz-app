/**
 * Backend `APIError.code` -> short, user-facing toast title.
 *
 * Keep titles ~3 words. The body of the toast carries the backend message,
 * and the code chip carries the raw code for support/debugging.
 */

const TITLES = {
  CONTENT_BLOCKED: "Couldn't accept that one",
  PROVIDER_RATE_LIMITED: "We're a bit busy",
  PROVIDER_BUSY: "We're a bit busy",
  HIGH_DEMAND: 'High demand right now',
  PROVIDER_QUOTA_EXCEEDED: 'Daily limit reached',
  PROVIDER_MISCONFIGURED: 'Working on a hiccup',
  THUMBNAIL_BAD_REQUEST: 'Try a different prompt',
  PROVIDER_UNAVAILABLE: 'Provider hiccup',
  INSUFFICIENT_CREDITS: 'Need more credits',
}

export function friendlyTitleFor(code) {
  if (!code) return 'Something went wrong'
  return TITLES[code] || 'Something went wrong'
}

/**
 * Pull a structured `{code, message}` out of whatever shape the API client
 * surfaced. Handles both:
 *   • APIError-shaped payloads:  { error: { code, message, ... } }
 *   • HTTPException payloads:    { detail: <string> | { code, message } }
 *   • Plain `Error` with .status / .message (network/HTTP fallback).
 *
 * Returns: { code: string|null, message: string }
 */
export function parseApiError(err, fallback = 'Something went wrong.') {
  const payload = err?.payload
  const errorObj = payload?.error
  const detailObj = payload?.detail && typeof payload.detail === 'object' ? payload.detail : null

  const code = errorObj?.code || detailObj?.code || err?.code || null
  const message =
    errorObj?.message ||
    detailObj?.message ||
    (typeof payload?.detail === 'string' ? payload.detail : null) ||
    err?.message ||
    fallback

  return { code, message }
}

/**
 * Convenience: build the `toast.error(...)` args from a caught error.
 *
 *   const { message, opts } = toastArgsFromError(err, 'Could not generate.')
 *   toast.error(message, opts)
 */
export function toastArgsFromError(err, fallback = 'Something went wrong.') {
  const { code, message } = parseApiError(err, fallback)
  return {
    message,
    opts: { code: code || undefined, title: friendlyTitleFor(code) },
  }
}
