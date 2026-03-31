/** Thumbnail generation and listing API. */
import { getApiBaseUrl } from '../lib/env.js'

function request(method, path, accessToken, body = null, headers = {}, fetchInit = {}) {
  const url = getApiBaseUrl() + path
  const h = { 'Content-Type': 'application/json', ...headers }
  if (accessToken) h.Authorization = `Bearer ${accessToken}`

  const opts = { method, headers: h, ...fetchInit }
  if (body != null) opts.body = JSON.stringify(body)

  return fetch(url, opts).then(async (res) => {
    const contentType = res.headers.get('Content-Type') || ''
    const isJson = contentType.includes('application/json')
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

function fetchThumbnailUrl(accessToken, youtubeUrl) {
  const base = getApiBaseUrl()
  const url = `${base}/api/thumbnails/youtube/fetch-existing?youtube_url=${encodeURIComponent(youtubeUrl)}`
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  }).then(async (r) => {
    if (!r.ok) {
      const err = await r.json().catch(() => ({}))
      throw new Error(err?.detail || r.statusText)
    }
    return r.json()
  })
}

export const thumbnailsApi = {
  fetchExistingThumbnail(accessToken, youtubeUrl) {
    return fetchThumbnailUrl(accessToken, youtubeUrl)
  },
  generateConcepts(accessToken, payload) {
    return request('POST', '/api/thumbnails/concepts', accessToken, payload)
  },
  generateBatch(accessToken, payload) {
    return request('POST', '/api/thumbnails/generate-batch', accessToken, payload)
  },
  regenerateWithPersona(accessToken, payload) {
    return request('POST', '/api/thumbnails/regenerate-with-persona', accessToken, payload)
  },
  generateSync(accessToken, payload) {
    return request('POST', '/api/thumbnails/generate-sync', accessToken, payload)
  },
  list(accessToken, params = {}) {
    const search = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== '') search.set(k, String(v))
    })
    const qs = search.toString()
    return request('GET', qs ? `/api/thumbnails?${qs}` : '/api/thumbnails', accessToken)
  },
  saveVariant(accessToken, payload) {
    return request('POST', '/api/thumbnails/save-variant', accessToken, payload)
  },
  delete(accessToken, thumbnailId) {
    return request('DELETE', `/api/thumbnails/${thumbnailId}`, accessToken)
  },
  listConversations(accessToken, params = {}) {
    const search = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== '') search.set(k, String(v))
    })
    const qs = search.toString()
    return request('GET', qs ? `/api/thumbnails/conversations?${qs}` : '/api/thumbnails/conversations', accessToken)
  },
  getConversation(accessToken, conversationId, params = {}) {
    const search = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== '') search.set(k, String(v))
    })
    const qs = search.toString()
    return request('GET', qs ? `/api/thumbnails/conversations/${conversationId}?${qs}` : `/api/thumbnails/conversations/${conversationId}`, accessToken)
  },
  chat(accessToken, payload, fetchInit = {}) {
    return request('POST', '/api/thumbnails/chat', accessToken, payload, {}, fetchInit)
  },
  updateConversation(accessToken, conversationId, payload) {
    return request('PATCH', `/api/thumbnails/conversations/${conversationId}`, accessToken, payload)
  },
  deleteConversation(accessToken, conversationId) {
    return request('DELETE', `/api/thumbnails/conversations/${conversationId}`, accessToken)
  },
  rate(accessToken, payload, fetchInit = {}) {
    return request('POST', '/api/thumbnails/rate', accessToken, payload, {}, fetchInit)
  },
  improve(accessToken, payload) {
    return request('POST', '/api/thumbnails/improve', accessToken, payload)
  },
  getJob(accessToken, jobId) {
    return request('GET', `/api/jobs/${jobId}`, accessToken)
  },
  editRegion(accessToken, payload, fetchInit = {}) {
    return request('POST', '/api/thumbnails/edit-region', accessToken, payload, {}, fetchInit)
  },
}
