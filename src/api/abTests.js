/** A/B tests API (multi-variant). */
import { getApiBaseUrl } from '../lib/env.js'

function request(method, path, accessToken, body = null) {
  const url = getApiBaseUrl() + path
  const headers = { 'Content-Type': 'application/json' }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  const opts = { method, headers }
  if (body != null) opts.body = JSON.stringify(body)
  return fetch(url, opts).then(async (res) => {
    const ct = res.headers.get('Content-Type') || ''
    const data = ct.includes('application/json') ? await res.json().catch(() => ({})) : {}
    if (res.status === 204) return null
    if (!res.ok) {
      const msg = data?.detail || data?.message || res.statusText
      const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
      err.status = res.status
      err.payload = data
      throw err
    }
    return data
  })
}

export const abTestsApi = {
  list(accessToken, { channelId, videoId, statusFilter } = {}) {
    const params = new URLSearchParams()
    if (channelId) params.set('channel_id', channelId)
    if (videoId) params.set('video_id', videoId)
    if (statusFilter) params.set('status_filter', statusFilter)
    const qs = params.toString()
    return request('GET', `/api/ab-tests/${qs ? `?${qs}` : ''}`, accessToken)
  },
  create(accessToken, payload) {
    return request('POST', '/api/ab-tests/', accessToken, payload)
  },
  results(accessToken, testId, { insights = false } = {}) {
    const qs = insights ? '?insights=true' : ''
    return request('GET', `/api/ab-tests/${testId}${qs}`, accessToken)
  },
  addVariation(accessToken, testId, variation) {
    return request('POST', `/api/ab-tests/${testId}/variations`, accessToken, variation)
  },
  activate(accessToken, testId, slug) {
    return request('POST', `/api/ab-tests/${testId}/activate`, accessToken, { slug })
  },
  promote(accessToken, testId, slug = null) {
    return request('POST', `/api/ab-tests/${testId}/promote`, accessToken, { slug })
  },
  pause(accessToken, testId) {
    return request('POST', `/api/ab-tests/${testId}/pause`, accessToken)
  },
  resume(accessToken, testId) {
    return request('POST', `/api/ab-tests/${testId}/resume`, accessToken)
  },
  complete(accessToken, testId) {
    return request('POST', `/api/ab-tests/${testId}/complete`, accessToken)
  },
  remove(accessToken, testId) {
    return request('DELETE', `/api/ab-tests/${testId}`, accessToken)
  },
  restoreOriginal(accessToken, testId) {
    return request('POST', `/api/ab-tests/${testId}/restore-original`, accessToken)
  },
  // Legacy
  switch(accessToken, testId, variationB) {
    return request('POST', `/api/ab-tests/${testId}/switch`, accessToken, {
      variation_b: variationB || {},
    })
  },
}
