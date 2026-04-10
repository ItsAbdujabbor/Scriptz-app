import { getApiBaseUrl } from '../lib/env.js'

function request(method, path, accessToken, body = null) {
  const url = getApiBaseUrl() + path
  const headers = { 'Content-Type': 'application/json' }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  const opts = { method, headers }
  if (body != null) opts.body = JSON.stringify(body)
  return fetch(url, opts).then(async (res) => {
    const contentType = res.headers.get('Content-Type') || ''
    const isJson = contentType.includes('application/json')
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

function searchParams(obj) {
  const sp = new URLSearchParams()
  Object.entries(obj).forEach(([k, v]) => {
    if (v != null && v !== '') sp.set(k, String(v))
  })
  const qs = sp.toString()
  return qs ? `?${qs}` : ''
}

export const thumbnailTemplatesApi = {
  list(accessToken, params = {}) {
    return request('GET', `/api/thumbnail-templates${searchParams(params)}`, accessToken)
  },
  categories(accessToken) {
    return request('GET', '/api/thumbnail-templates/categories', accessToken)
  },
}
