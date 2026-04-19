/**
 * Dashboard API client — AI insights, channel audit, growth,
 * best-time, snapshot, and idea feedback.
 * Uses same base URL as auth; send X-Channel-Id for channel-scoped endpoints.
 */

import { getApiBaseUrl } from '../lib/env.js'

function request(method, path, accessToken, body = null, headers = {}, channelId = null) {
  const url = getApiBaseUrl() + path
  const h = { 'Content-Type': 'application/json', ...headers }
  if (accessToken) h['Authorization'] = `Bearer ${accessToken}`
  if (channelId) h['X-Channel-Id'] = channelId
  const opts = { method, headers: h }
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
 * @param {string} accessToken
 * @param {string|null} channelId - Required for channel insights; omit for onboarding insights
 */
export const dashboardApi = {
  /** GET /api/dashboard/insights — Script suggestions (channel required). cachedOnly skips generation. */
  getInsights(accessToken, channelId, regenerate = false, cachedOnly = false) {
    const params = []
    if (regenerate) params.push('regenerate=true')
    if (cachedOnly) params.push('cached_only=true')
    const qs = params.length ? '?' + params.join('&') : ''
    return request('GET', '/api/dashboard/insights' + qs, accessToken, null, {}, channelId)
  },

  /** GET /api/dashboard/insights/onboarding — Script suggestions without channel */
  getOnboardingInsights(accessToken, regenerate = false, cachedOnly = false) {
    const params = []
    if (regenerate) params.push('regenerate=true')
    if (cachedOnly) params.push('cached_only=true')
    const qs = params.length ? '?' + params.join('&') : ''
    return request('GET', '/api/dashboard/insights/onboarding' + qs, accessToken)
  },

  /** POST /api/dashboard/idea-feedback — Submit interested / not interested for a script idea */
  submitIdeaFeedback(accessToken, body) {
    return request('POST', '/api/dashboard/idea-feedback', accessToken, body)
  },

  /** GET /api/dashboard/channel-audit — Channel health audit (scores, fixes) */
  getChannelAudit(accessToken, channelId) {
    return request('GET', '/api/dashboard/channel-audit', accessToken, null, {}, channelId)
  },

  /** GET /api/dashboard/growth — Growth velocity + 30d projection */
  getGrowth(accessToken, channelId) {
    return request('GET', '/api/dashboard/growth', accessToken, null, {}, channelId)
  },

  /** GET /api/dashboard/growth-series — Time series for sparklines (from, to required) */
  getGrowthSeries(accessToken, channelId, from, to) {
    const qs = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    return request('GET', '/api/dashboard/growth-series?' + qs, accessToken, null, {}, channelId)
  },

  /** GET /api/dashboard/best-time — Best time to post (slots, heatmap, bar chart). utc_offset_minutes optional. */
  getBestTime(accessToken, channelId, utcOffsetMinutes = 0) {
    return request(
      'GET',
      `/api/dashboard/best-time?utc_offset_minutes=${utcOffsetMinutes}`,
      accessToken,
      null,
      {},
      channelId
    )
  },

  /** GET /api/dashboard/snapshot — KPI snapshot for date range (from, to required) */
  getSnapshot(accessToken, channelId, from, to) {
    const qs = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    return request('GET', '/api/dashboard/snapshot?' + qs, accessToken, null, {}, channelId)
  },
}
