/** Script Generator / flow API client. */
import { getApiBaseUrl } from '../lib/env.js'

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
  writingSuggestions(accessToken, channelId = null) {
    const path = withQuery(
      '/api/scripts/chatbot/writing-suggestions',
      channelId ? { channel_id: channelId } : {}
    )
    return request('GET', path, accessToken, null, {})
  },
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
