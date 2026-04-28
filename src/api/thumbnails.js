/** Thumbnail generation and chat API. */
import { getApiBaseUrl } from '../lib/env.js'
import { parseApiError } from '../lib/aiErrors.js'

/** UUID-ish key for the Idempotency-Key header — see api/videoThumbnails.js
 *  for the full design. One key per *click intent*, reused on retries. */
function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return (
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 12) +
    Math.random().toString(36).slice(2, 12)
  )
}

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
      // Rich error: status, code, retryAfterMs, feature — see lib/aiErrors.
      throw parseApiError(res, data)
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
      const data = await r.json().catch(() => ({}))
      throw parseApiError(r, data)
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
  /**
   * Generate 1-4 thumbnails. Sends an Idempotency-Key so a double-click
   * or a network-layer retry can't create two batches and double-charge.
   * Pass ``options.idempotencyKey`` to control retry semantics from the
   * caller (e.g. share one key across automatic retries of the same
   * click intent); otherwise a fresh key is generated per call.
   */
  generateBatch(accessToken, payload, options = {}) {
    const key = options.idempotencyKey || newIdempotencyKey()
    return request(
      'POST',
      '/api/thumbnails/generate-batch',
      accessToken,
      payload,
      { 'Idempotency-Key': key },
    )
  },
  regenerateWithPersona(accessToken, payload) {
    return request('POST', '/api/thumbnails/regenerate-with-persona', accessToken, payload)
  },
  generateSync(accessToken, payload) {
    return request('POST', '/api/thumbnails/generate-sync', accessToken, payload)
  },
  /** Create an empty conversation up-front so the sidebar can show a row
   *  immediately while the first generation runs in the background. */
  createConversation(accessToken, params = {}) {
    const search = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== '') search.set(k, String(v))
    })
    const qs = search.toString()
    return request(
      'POST',
      qs ? `/api/thumbnails/conversations?${qs}` : '/api/thumbnails/conversations',
      accessToken
    )
  },
  listConversations(accessToken, params = {}) {
    const search = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== '') search.set(k, String(v))
    })
    const qs = search.toString()
    return request(
      'GET',
      qs ? `/api/thumbnails/conversations?${qs}` : '/api/thumbnails/conversations',
      accessToken
    )
  },
  getConversation(accessToken, conversationId, params = {}, fetchInit = {}) {
    const search = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== '') search.set(k, String(v))
    })
    const qs = search.toString()
    return request(
      'GET',
      qs
        ? `/api/thumbnails/conversations/${conversationId}?${qs}`
        : `/api/thumbnails/conversations/${conversationId}`,
      accessToken,
      null,
      {},
      fetchInit
    )
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
  /** Mark the conversation as seen — clears the unread dot server-side.
   *  Idempotent: only bumps last_seen_at forward. */
  markConversationSeen(accessToken, conversationId) {
    return request(
      'POST',
      `/api/thumbnails/conversations/${conversationId}/seen`,
      accessToken
    )
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
  /** Swap the face inside a thumbnail with a target face image.
   *  payload: { thumbnail_image_base64?, thumbnail_image_url?, face_image_base64?, face_image_url?, extra_hint? }
   *  Response: { image_url, tier, steps } */
  faceSwap(accessToken, payload, fetchInit = {}) {
    return request('POST', '/api/thumbnails/face-swap', accessToken, payload, {}, fetchInit)
  },
}
