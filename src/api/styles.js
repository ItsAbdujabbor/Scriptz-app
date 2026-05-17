/** Thumbnail style presets API. */
import { apiFetch } from '../lib/apiFetch.js'

function request(method, path, accessToken, body = null, headers = {}) {
  return apiFetch(path, { method, body: body ?? undefined, token: accessToken, headers })
}

export const stylesApi = {
  list(accessToken, params = {}) {
    const search = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== '') search.set(k, String(v))
    })
    const qs = search.toString()
    return request('GET', qs ? `/api/styles/?${qs}` : '/api/styles/', accessToken)
  },
  get(accessToken, styleId) {
    return request('GET', `/api/styles/${styleId}`, accessToken)
  },
  create(accessToken, payload) {
    // Trailing slash matters — FastAPI is mounted at `/api/styles/`
    // and serves a 307 redirect for `/api/styles`. Browsers preserve
    // the body across the redirect inconsistently (Safari in particular
    // can drop the JSON), which surfaces as "Failed to fetch" instead
    // of a normal 4xx from the API.
    return request('POST', '/api/styles/', accessToken, payload)
  },
  createFromUpload(accessToken, formData) {
    // rawBody → send FormData as-is; browser sets the multipart boundary.
    return apiFetch('/api/styles/upload', {
      method: 'POST',
      body: formData,
      rawBody: true,
      token: accessToken,
    })
  },
  update(accessToken, styleId, payload) {
    return request('PATCH', `/api/styles/${styleId}`, accessToken, payload)
  },
  delete(accessToken, styleId) {
    return request('DELETE', `/api/styles/${styleId}`, accessToken)
  },
}
