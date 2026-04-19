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

function withQuery(path, params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '') return
    search.set(key, String(value))
  })
  const qs = search.toString()
  return qs ? `${path}?${qs}` : path
}

export const scriptsApi = {
  sendChatMessage(accessToken, payload, channelId = null) {
    const headers = {}
    if (channelId) headers['X-Channel-Id'] = channelId
    return request('POST', '/api/scripts/chatbot', accessToken, payload, headers)
  },
  listConversations(accessToken, params = {}) {
    return request('GET', withQuery('/api/scripts/chatbot/conversations', params), accessToken)
  },
  getConversation(accessToken, conversationId, params = {}) {
    return request('GET', withQuery(`/api/scripts/chatbot/conversations/${conversationId}`, params), accessToken)
  },
  updateConversation(accessToken, conversationId, payload) {
    return request('PATCH', `/api/scripts/chatbot/conversations/${conversationId}`, accessToken, payload)
  },
  deleteConversation(accessToken, conversationId) {
    return request('DELETE', `/api/scripts/chatbot/conversations/${conversationId}`, accessToken)
  },
}
