/**
 * User preferences / profile API — sync onboarding and account settings.
 * Base URL same as auth (proxy in dev).
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

/**
 * Preferences shape: { niche, videoFormat, uploadFrequency, youtube?: { connected, channelName?, avatar?, subscriberCount? } }
 */
export const userApi = {
  getPreferences(accessToken) {
    return request('GET', '/api/user/preferences', null, accessToken)
  },
  savePreferences(accessToken, preferences) {
    return request('PUT', '/api/user/preferences', preferences, accessToken)
  },
  /** Delete all user data (preferences, content). Account remains. */
  deleteData(accessToken) {
    return request('DELETE', '/api/user/data', null, accessToken)
  },
}
