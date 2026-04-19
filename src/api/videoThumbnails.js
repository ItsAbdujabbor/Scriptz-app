/**
 * Video Optimize Thumbnail API — generate, list, delete.
 * Separate from thumbnail chat. Stored per video.
 */
import { getApiBaseUrl } from '../lib/env.js'

function request(method, path, accessToken, body = null) {
  const url = getApiBaseUrl() + path
  const h = { 'Content-Type': 'application/json' }
  if (accessToken) h['Authorization'] = `Bearer ${accessToken}`
  const opts = { method, headers: h }
  if (body != null) opts.body = JSON.stringify(body)
  return fetch(url, opts).then(async (res) => {
    const data = await res.json().catch(() => ({}))
    if (!res.ok)
      throw new Error(data?.detail || data?.error?.message || `Request failed (${res.status})`)
    return data
  })
}

export const videoThumbnailsApi = {
  generate(accessToken, { video_id, channel_id, message, num_thumbnails, persona_id, style_id }) {
    return request('POST', '/api/video-thumbnails/generate', accessToken, {
      video_id,
      channel_id,
      message,
      num_thumbnails,
      persona_id,
      style_id,
    })
  },

  list(accessToken, videoId) {
    return request('GET', `/api/video-thumbnails/${encodeURIComponent(videoId)}`, accessToken)
  },

  delete(accessToken, thumbnailId) {
    return request('DELETE', `/api/video-thumbnails/${thumbnailId}`, accessToken)
  },
}
