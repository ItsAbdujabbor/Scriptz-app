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

import { getApiBaseUrl } from '../lib/env.js'
import { parseApiError } from '../lib/aiErrors.js'

function request(method, path, body, accessToken) {
  const url = getApiBaseUrl() + path
  const headers = { 'Content-Type': 'application/json' }
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
  const opts = { method, headers }
  if (body != null) opts.body = JSON.stringify(body)
  return fetch(url, opts).then(async (res) => {
    const contentType = res.headers.get('Content-Type') || ''
    const isJson = contentType.indexOf('application/json') !== -1
    const data = isJson ? await res.json().catch(() => ({})) : {}
    if (!res.ok) throw parseApiError(res, data)
    return data
  })
}

export const emailPreferencesApi = {
  get(accessToken) {
    return request('GET', '/api/email/preferences', null, accessToken)
  },
  save(accessToken, prefs) {
    return request('PUT', '/api/email/preferences', prefs, accessToken)
  },
}
