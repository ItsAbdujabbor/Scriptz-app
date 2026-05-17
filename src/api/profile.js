/**
 * User profile and channel API — Clixa API.
 * GET/PUT /api/profile, GET/PUT /api/profile/channel/{channel_id}
 */

import { apiFetch } from '../lib/apiFetch.js'

function request(method, path, body, accessToken) {
  return apiFetch(path, { method, body: body ?? undefined, token: accessToken })
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
