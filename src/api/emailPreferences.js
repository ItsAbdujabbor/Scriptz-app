/**
 * Email preferences API — per-category notification settings.
 *
 * Backend contract:
 *   GET  /api/email/preferences → { transactional, lifecycle, marketing,
 *                                   product_updates, updated_at }
 *   PUT  /api/email/preferences (same shape; transactional always true)
 *
 * `transactional` is locked on by the backend regardless of what we send,
 * but we mirror that lock in the UI for clarity.
 */

import { apiFetch } from '../lib/apiFetch.js'

function request(method, path, body, accessToken) {
  return apiFetch(path, { method, body: body ?? undefined, token: accessToken })
}

export const emailPreferencesApi = {
  get(accessToken) {
    return request('GET', '/api/email/preferences', null, accessToken)
  },
  save(accessToken, prefs) {
    return request('PUT', '/api/email/preferences', prefs, accessToken)
  },
}
