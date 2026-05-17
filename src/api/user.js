/**
 * User preferences / profile API — sync onboarding and account settings.
 * Base URL same as auth (proxy in dev).
 */

import { apiFetch } from '../lib/apiFetch.js'

function request(method, path, body, accessToken) {
  return apiFetch(path, { method, body: body ?? undefined, token: accessToken })
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
  /** Delete all user data (preferences, content). Account remains.
   *  The backend requires an explicit confirmation flag so an
   *  accidental / forged fire-and-forget DELETE can't wipe data. */
  deleteData(accessToken) {
    return request('DELETE', '/api/user/data', { confirm: true }, accessToken)
  },
}
