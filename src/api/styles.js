const getBaseUrl = () => {
  const env = typeof import.meta !== 'undefined' && import.meta.env
  if (env?.DEV) return ''
  const explicit = env?.VITE_API_BASE_URL
  return (explicit && String(explicit).trim() !== '') ? String(explicit).trim() : 'http://localhost:8000'
}

function request(method, path, accessToken, body = null, headers = {}) {
  const url = getBaseUrl() + path
  const h = { 'Content-Type': 'application/json', ...headers }
  if (accessToken) h.Authorization = `Bearer ${accessToken}`

  const opts = { method, headers: h }
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

export const stylesApi = {
  list(accessToken, params = {}) {
    const search = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') search.set(k, String(v)) })
    const qs = search.toString()
    return request('GET', qs ? `/api/styles/?${qs}` : '/api/styles/', accessToken)
  },
  get(accessToken, styleId) {
    return request('GET', `/api/styles/${styleId}`, accessToken)
  },
  create(accessToken, payload) {
    return request('POST', '/api/styles', accessToken, payload)
  },
  createFromUpload(accessToken, formData) {
    const url = getBaseUrl() + '/api/styles/upload'
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
      if (!res.ok) {
        const msg = (data?.detail || data?.message) || res.statusText
        const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
        err.status = res.status
        throw err
      }
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
