/** Personas API — list, CRUD, favorites, AI generation. */
import { apiFetch } from '../lib/apiFetch.js'

function request(method, path, accessToken, body = null, headers = {}) {
  return apiFetch(path, { method, body: body ?? undefined, token: accessToken, headers })
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
    // FormData must include 'name' as required by API. apiFetch's rawBody
    // mode sends the FormData untouched and omits Content-Type so the
    // browser sets the multipart boundary itself.
    if (!formData.get('name')) formData.append('name', 'My Persona')
    return apiFetch('/api/personas/generate-from-images', {
      method: 'POST',
      body: formData,
      rawBody: true,
      token: accessToken,
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
