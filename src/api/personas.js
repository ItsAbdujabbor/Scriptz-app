/** Personas API — list, CRUD, favorites, AI generation. */
import { getApiBaseUrl } from '../lib/env.js'
import { parseApiError } from '../lib/aiErrors.js'

function request(method, path, accessToken, body = null, headers = {}) {
  const url = getApiBaseUrl() + path
  const h = { 'Content-Type': 'application/json', ...headers }
  if (accessToken) h.Authorization = `Bearer ${accessToken}`

  const opts = { method, headers: h }
  if (body != null) opts.body = JSON.stringify(body)

  return fetch(url, opts).then(async (res) => {
    const contentType = res.headers.get('Content-Type') || ''
    const isJson = contentType.includes('application/json')
    const data = isJson ? await res.json().catch(() => ({})) : {}
    if (!res.ok) throw parseApiError(res, data)
    return data
  })
}

export const personasApi = {
  list(accessToken, params = {}) {
    const search = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== '') search.set(k, String(v))
    })
    const qs = search.toString()
    return request('GET', qs ? `/api/personas/?${qs}` : '/api/personas/', accessToken)
  },
  get(accessToken, personaId) {
    return request('GET', `/api/personas/${personaId}`, accessToken)
  },
  create(accessToken, payload) {
    return request('POST', '/api/personas', accessToken, payload)
  },
  createFromImages(accessToken, formData) {
    const url = getApiBaseUrl() + '/api/personas/generate-from-images'
    const headers = {}
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`
    // FormData must include 'name' as required by API (no Content-Type - fetch sets multipart boundary)
    if (!formData.get('name')) formData.append('name', 'My Persona')

    return fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    }).then(async (res) => {
      const contentType = res.headers.get('Content-Type') || ''
      const isJson = contentType.includes('application/json')
      const data = isJson ? await res.json().catch(() => ({})) : {}
      if (!res.ok) throw parseApiError(res, data)
      return data
    })
  },
  update(accessToken, personaId, payload) {
    return request('PATCH', `/api/personas/${personaId}`, accessToken, payload)
  },
  delete(accessToken, personaId) {
    return request('DELETE', `/api/personas/${personaId}`, accessToken)
  },
  addFavorite(accessToken, payload) {
    return request('POST', '/api/personas/favorites', accessToken, payload)
  },
  removeFavorite(accessToken, personaId) {
    return request('DELETE', `/api/personas/favorites/${personaId}`, accessToken)
  },
}
