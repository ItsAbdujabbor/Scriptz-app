/** Thumbnail style presets API. */
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
    const url = getApiBaseUrl() + '/api/styles/upload'
    const headers = {}
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`

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
  update(accessToken, styleId, payload) {
    return request('PATCH', `/api/styles/${styleId}`, accessToken, payload)
  },
  delete(accessToken, styleId) {
    return request('DELETE', `/api/styles/${styleId}`, accessToken)
  },
}
