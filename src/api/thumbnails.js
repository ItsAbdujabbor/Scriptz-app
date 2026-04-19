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

function fetchThumbnailUrl(accessToken, youtubeUrl) {
  const env = typeof import.meta !== 'undefined' && import.meta.env
  const base = env?.DEV ? '' : ((env?.VITE_API_BASE_URL || '').trim() || 'http://localhost:8000')
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
}
