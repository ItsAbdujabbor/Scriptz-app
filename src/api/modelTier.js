/** SRX model tier API. */
import { apiFetch } from '../lib/apiFetch.js'

function request(method, path, accessToken, body = null) {
  return apiFetch(path, { method, body: body ?? undefined, token: accessToken })
}

export function getModelTierState(accessToken) {
  return request('GET', '/api/model-tier', accessToken)
}

export function setModelTier(accessToken, tier) {
  return request('POST', '/api/model-tier', accessToken, { tier })
}
