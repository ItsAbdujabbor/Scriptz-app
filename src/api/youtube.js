/**
 * YouTube — thumbnail-fetch only.
 *
 * The full YouTube account integration was removed. The single capability
 * left is "given a YouTube URL, get the thumbnail image" so the user can
 * use a real video's thumbnail as a reference for AI image generation.
 */

import { getApiBaseUrl } from '../lib/env.js'
import { parseApiError } from '../lib/aiErrors.js'

function authHeaders(accessToken) {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
}

export const youtubeApi = {
  /**
   * Fetch the thumbnail image bytes for a YouTube URL.
   * Returns a Blob the caller can pass to URL.createObjectURL or upload.
   */
  async fetchThumbnail(accessToken, youtubeUrl) {
    const u = `${getApiBaseUrl()}/api/youtube/thumbnail?url=${encodeURIComponent(youtubeUrl)}`
    const res = await fetch(u, { headers: authHeaders(accessToken) })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw parseApiError(res, data)
    }
    return res.blob()
  },

  /**
   * Resolve the canonical public thumbnail URL for a YouTube video without
   * fetching the bytes. Returns `{ video_id, url, fallback_url }`.
   */
  async getThumbnailUrl(accessToken, youtubeUrl) {
    const u = `${getApiBaseUrl()}/api/youtube/thumbnail-url?url=${encodeURIComponent(youtubeUrl)}`
    const res = await fetch(u, { headers: authHeaders(accessToken) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw parseApiError(res, data)
    return data
  },
}
