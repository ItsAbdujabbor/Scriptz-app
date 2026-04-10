/** Script Flow API client — multi-step generation wizard. */
import { getApiBaseUrl } from '../lib/env.js'

function request(method, path, accessToken, body = null) {
  const url = getApiBaseUrl() + path
  const h = { 'Content-Type': 'application/json' }
  if (accessToken) h.Authorization = `Bearer ${accessToken}`
  const opts = { method, headers: h }
  if (body != null) opts.body = JSON.stringify(body)
  return fetch(url, opts).then(async (res) => {
    const ct = res.headers.get('Content-Type') || ''
    const data = ct.includes('application/json') ? await res.json().catch(() => ({})) : {}
    if (!res.ok) {
      const msg = data?.detail || data?.message || res.statusText
      const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
      err.status = res.status
      throw err
    }
    return data
  })
}

export const scriptFlowApi = {
  /** Step 1: Analyze user input → 3 script concepts */
  submit(accessToken, payload) {
    return request('POST', '/api/scripts/flow/submit', accessToken, payload)
  },
  /** Step 2: Select a concept → generate full script */
  selectOption(accessToken, payload) {
    return request('POST', '/api/scripts/flow/select-option', accessToken, payload)
  },
  /** Edit specific sections by instruction */
  editSections(accessToken, payload) {
    return request('POST', '/api/scripts/flow/edit', accessToken, payload)
  },
  /** Rewrite a single section */
  rewriteSection(accessToken, payload) {
    return request('POST', '/api/scripts/flow/rewrite-section', accessToken, payload)
  },
  /** Regenerate script (partial or full) */
  regenerate(accessToken, payload) {
    return request('POST', '/api/scripts/flow/regenerate', accessToken, payload)
  },
  /** Save current script sections */
  saveScript(accessToken, sessionId, payload) {
    return request('PATCH', `/api/scripts/flow/session/${sessionId}/script`, accessToken, payload)
  },
  /** Load session for rehydration */
  getSession(accessToken, sessionId) {
    return request('GET', `/api/scripts/flow/session/${sessionId}`, accessToken)
  },
}
