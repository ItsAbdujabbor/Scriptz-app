/**
 * User preferences / profile API — sync onboarding and account settings.
 * Base URL same as auth (proxy in dev).
 */

const getBaseUrl = () => {
  const env = typeof import.meta !== 'undefined' && import.meta.env
  if (env?.DEV) return ''
  const explicit = env?.VITE_API_BASE_URL
  return (explicit && String(explicit).trim() !== '') ? String(explicit).trim() : 'http://localhost:8000'
}

function request(method, path, body, accessToken) {
  const url = getBaseUrl() + path
  const headers = { 'Content-Type': 'application/json' }
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
  const opts = { method, headers }
  if (body != null) opts.body = JSON.stringify(body)
  return fetch(url, opts).then(async (res) => {
    const contentType = res.headers.get('Content-Type') || ''
    const isJson = contentType.indexOf('application/json') !== -1
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

/**
 * Preferences shape: { niche, videoFormat, uploadFrequency, youtube?: { connected, channelName?, avatar?, subscriberCount? } }
 */
export const userApi = {
  getPreferences(accessToken) {
    return request('GET', '/api/user/preferences', null, accessToken)
  },
  savePreferences(accessToken, preferences) {
    return request('PUT', '/api/user/preferences', preferences, accessToken)
  },
  /** Delete all user data (preferences, content). Account remains. */
  deleteData(accessToken) {
    return request('DELETE', '/api/user/data', null, accessToken)
  },
}
