/**
 * YouTube API client — OAuth connect, list channels, channel info, disconnect, switch.
 * Uses same base URL as auth (Vite proxy in dev).
 */

import { getApiBaseUrl } from '../lib/env.js'

function request(method, path, accessToken, body = null, headers = {}) {
  const url = getApiBaseUrl() + path
  const h = { 'Content-Type': 'application/json', ...headers }
  if (accessToken) h['Authorization'] = `Bearer ${accessToken}`
  const opts = { method, headers: h }
  if (body != null) opts.body = JSON.stringify(body)
  return fetch(url, opts).then(async (res) => {
    const contentType = res.headers.get('Content-Type') || ''
    const isJson = contentType.indexOf('application/json') !== -1
    const data = isJson ? await res.json().catch(() => ({})) : {}
    if (!res.ok) {
      const msg = (data?.detail || data?.message) || res.statusText
      const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
      err.status = res.status
      throw err
    }
    return data
  })
}

export const youtubeApi = {
  /** Get OAuth authorization URL to redirect the user to Google. */
  getAuthorizationUrl(accessToken) {
    return request('GET', '/api/youtube/connect', accessToken).then((r) => r.authorization_url)
  },

  /** List all connected YouTube channels for the user. */
  listChannels(accessToken) {
    return request('GET', '/api/youtube/channels', accessToken)
  },

  /** Get full channel info (avatar, subs, views, etc.) for the active or specified channel. */
  getChannelInfo(accessToken, channelId = null) {
    const headers = channelId ? { 'X-Channel-Id': channelId } : {}
    return request('GET', '/api/youtube/me', accessToken, null, headers)
  },

  /** Disconnect a YouTube channel. */
  disconnectChannel(accessToken, channelId) {
    return request('DELETE', `/api/youtube/channels/${encodeURIComponent(channelId)}`, accessToken)
  },

  /** Set the active channel for subsequent operations. */
  switchChannel(accessToken, channelId) {
    return request('POST', '/api/youtube/channels/switch', accessToken, { channel_id: channelId })
  },

  /**
   * List channel videos (paginated, cached on backend). Uses DB-first cache with TTL.
   * @param {string} accessToken
   * @param {object} options - { page, per_page, search, sort, video_type } (sort: published_at | views | engagement; video_type: all | videos | shorts)
   */
  listVideos(accessToken, options = {}) {
    const params = new URLSearchParams()
    if (options.page != null) params.set('page', String(options.page))
    if (options.per_page != null) params.set('per_page', String(options.per_page))
    if (options.search != null && options.search.trim()) params.set('search', options.search.trim())
    if (options.sort != null) params.set('sort', options.sort)
    if (options.video_type != null && options.video_type !== 'all') params.set('video_type', options.video_type)
    const qs = params.toString()
    const path = '/api/youtube/videos' + (qs ? '?' + qs : '')
    return request('GET', path, accessToken)
  },

  /**
   * Get AI optimization suggestions for a video (titles, description, tags, etc.).
   * POST /api/youtube/optimize-video body: { video_id }
   */
  optimizeVideo(accessToken, videoId) {
    return request('POST', '/api/youtube/optimize-video', accessToken, { video_id: videoId })
  },

  /**
   * Score a video title with Gemini AI. POST /api/youtube/score-title body: { title }
   * Returns { score, tier, explanation }.
   */
  scoreTitle(accessToken, title) {
    return request('POST', '/api/youtube/score-title', accessToken, { title: title || '' })
  },

  /**
   * Generate 3 AI title recommendations. POST /api/youtube/title-recommendations
   * Body: { video_idea, script_text?, thumbnail_url }
   * Returns { titles: [{ title, score }], thumbnail_url }.
   */
  getTitleRecommendations(accessToken, body) {
    return request('POST', '/api/youtube/title-recommendations', accessToken, body)
  },

  /**
   * Refine video description with an instruction. POST /api/youtube/refine-description
   * Body: { video_id, description, instruction }. Returns { description }.
   */
  refineDescription(accessToken, body) {
    return request('POST', '/api/youtube/refine-description', accessToken, body)
  },

  /**
   * Generate tags with scores. POST /api/youtube/generate-tags
   * Body: { video_id, description?, title? }. Returns { tags: [{ tag, score }] }.
   */
  generateTags(accessToken, body) {
    return request('POST', '/api/youtube/generate-tags', accessToken, body)
  },

  /**
   * Apply title, description, tags to a video on YouTube.
   * PATCH /api/youtube/videos/{video_id} body: { title?, description?, tags? }
   */
  updateVideoMetadata(accessToken, videoId, body) {
    return request('PATCH', `/api/youtube/videos/${encodeURIComponent(videoId)}`, accessToken, body)
  },
}
