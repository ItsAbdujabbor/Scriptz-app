/**
 * User profile and channel API — Scriptz API.
 * GET/PUT /api/profile, GET/PUT /api/profile/channel/{channel_id}
 */

import { getApiBaseUrl } from '../lib/env.js'

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
    if (!res.ok) {
      const msg = data?.detail || data?.message || res.statusText
      const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
      err.status = res.status
      throw err
    }
    return data
  })
}

/**
 * Profile shape from API may use snake_case: niche, video_format, upload_frequency, etc.
 */
export const profileApi = {
  /** GET /api/profile — get user profile */
  getProfile(accessToken) {
    return request('GET', '/api/profile', null, accessToken)
  },

  /** PUT /api/profile — create or update user profile. Body: { niche?, video_format?, upload_frequency?, ... } */
  updateProfile(accessToken, profile) {
    return request('PUT', '/api/profile', profile, accessToken)
  },

  /** GET /api/profile/channel/{channel_id} — get channel information */
  getChannel(accessToken, channelId) {
    return request(
      'GET',
      `/api/profile/channel/${encodeURIComponent(channelId)}`,
      null,
      accessToken
    )
  },

  /** PUT /api/profile/channel/{channel_id} — create or update channel information */
  updateChannel(accessToken, channelId, channel) {
    return request(
      'PUT',
      `/api/profile/channel/${encodeURIComponent(channelId)}`,
      channel,
      accessToken
    )
  },
}
