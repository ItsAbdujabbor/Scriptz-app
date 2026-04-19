/** SRX model tier API. */
import { getApiBaseUrl } from '../lib/env.js'

function request(method, path, accessToken, body = null) {
  const url = getApiBaseUrl() + path
  const headers = { 'Content-Type': 'application/json' }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  const opts = { method, headers }
  if (body != null) opts.body = JSON.stringify(body)
  return fetch(url, opts).then(async (res) => {
    const ct = res.headers.get('Content-Type') || ''
    const data = ct.includes('application/json') ? await res.json().catch(() => ({})) : {}
    if (!res.ok) {
      const msg = data?.detail || data?.message || res.statusText
      const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
      err.status = res.status
      err.payload = data
      throw err
    }
    return data
  })
}

export function getModelTierState(accessToken) {
  return request('GET', '/api/model-tier', accessToken)
}

export function setModelTier(accessToken, tier) {
  return request('POST', '/api/model-tier', accessToken, { tier })
}
