/** AI Coach chat API. */
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
      const msg = data?.detail || data?.message || res.statusText
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

export const coachApi = {
  listConversations(accessToken, params = {}) {
    return request('GET', withQuery('/api/coach/conversations', params), accessToken)
  },
  getConversation(accessToken, conversationId, params = {}) {
    return request(
      'GET',
      withQuery(`/api/coach/conversations/${conversationId}`, params),
      accessToken
    )
  },
  sendMessage(accessToken, payload, channelId = null) {
    const headers = {}
    if (channelId) headers['X-Channel-Id'] = channelId
    return request('POST', '/api/coach/chat', accessToken, payload, headers)
  },
  async streamMessage(
    accessToken,
    payload,
    { channelId = null, signal = null, onEvent = null } = {}
  ) {
    const headers = { 'Content-Type': 'application/json' }
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`
    if (channelId) headers['X-Channel-Id'] = channelId

    const response = await fetch(getApiBaseUrl() + '/api/coach/chat/stream', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    })

    if (!response.ok) {
      let message = response.statusText
      try {
        const data = await response.json()
        message = data?.detail || data?.message || message
      } catch (_) {}
      throw new Error(typeof message === 'string' ? message : JSON.stringify(message))
    }

    if (!response.body) {
      throw new Error('Streaming response body was not available.')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    const emit = (rawEvent) => {
      const lines = rawEvent.split('\n')
      let eventName = 'message'
      const dataLines = []

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim())
        }
      }

      if (!dataLines.length) return

      let parsed = dataLines.join('\n')
      try {
        parsed = JSON.parse(parsed)
      } catch (_) {}

      onEvent?.({ event: eventName, data: parsed })
    }

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')

      let separatorIndex = buffer.indexOf('\n\n')
      while (separatorIndex !== -1) {
        const rawEvent = buffer.slice(0, separatorIndex).trim()
        buffer = buffer.slice(separatorIndex + 2)
        if (rawEvent) emit(rawEvent)
        separatorIndex = buffer.indexOf('\n\n')
      }
    }

    const trailing = buffer.trim()
    if (trailing) emit(trailing)
  },
  async transcribeAudio(accessToken, audioBlob, mimeType = 'audio/webm', { signal = null } = {}) {
    const url = getApiBaseUrl() + '/api/coach/transcribe'
    const headers = {}
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`

    const formData = new FormData()
    const extension = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm'
    formData.append('audio', audioBlob, `coach-recording.${extension}`)

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
      signal,
    })

    const contentType = response.headers.get('Content-Type') || ''
    const isJson = contentType.includes('application/json')
    const data = isJson ? await response.json().catch(() => ({})) : {}
    if (!response.ok) {
      const msg = data?.detail || data?.message || response.statusText
      const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
      err.status = response.status
      throw err
    }
    return data
  },
  updateConversation(accessToken, conversationId, payload) {
    return request('PATCH', `/api/coach/conversations/${conversationId}`, accessToken, payload)
  },
  deleteConversation(accessToken, conversationId) {
    return request('DELETE', `/api/coach/conversations/${conversationId}`, accessToken)
  },
}
