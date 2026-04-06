/**
 * Auth API client — login, register, refresh, logout.
 * In dev: use same origin ('') so Vite proxy forwards /api to the backend (avoids CORS OPTIONS).
 * In production: VITE_API_BASE_URL or fallback http://localhost:8000.
 */

import { getApiBaseUrl } from '../lib/env.js'

function request(method, path, body, useAuth = false, token = null) {
  const url = getApiBaseUrl() + path
  const headers = { 'Content-Type': 'application/json' }
  if (useAuth && token) headers['Authorization'] = `Bearer ${token}`
  const opts = { method, headers }
  if (body != null) opts.body = JSON.stringify(body)
  return fetch(url, opts).then(async (res) => {
    const contentType = res.headers.get('Content-Type') || ''
    const isJson = contentType.indexOf('application/json') !== -1
    const data = isJson ? await res.json().catch(() => ({})) : {}
    if (!res.ok) {
      const apiErr = data && data.error
      let msg =
        (apiErr && apiErr.message) || (data && (data.detail || data.message)) || res.statusText
      if (Array.isArray(msg) && msg[0] && typeof msg[0].msg === 'string') msg = msg[0].msg
      else if (typeof msg !== 'string') msg = JSON.stringify(msg)
      const err = new Error(msg)
      err.status = res.status
      err.body = data
      if (apiErr?.code) err.code = apiErr.code
      if (apiErr?.extra) err.extra = apiErr.extra
      throw err
    }
    return data
  })
}

export const authApi = {
  login(email, password) {
    return request('POST', '/api/auth/login', { email, password }, false)
  },
  register(email, password, username = null) {
    return request('POST', '/api/auth/register', { email, password, username }, false)
  },
  refresh(refreshToken) {
    return request('POST', '/api/auth/refresh', { refresh_token: refreshToken }, false)
  },
  logout(refreshToken) {
    return request('POST', '/api/auth/logout', { refresh_token: refreshToken }, false)
  },
  forgotPassword(email) {
    return request('POST', '/api/auth/forgot-password', { email }, false)
  },
  resetPassword(token, newPassword) {
    return request('POST', '/api/auth/reset-password', { token, new_password: newPassword }, false)
  },
  changePassword(currentPassword, newPassword, accessToken) {
    return request(
      'POST',
      '/api/auth/change-password',
      { current_password: currentPassword, new_password: newPassword },
      true,
      accessToken
    )
  },
  /** Permanently delete account. Password optional for Supabase-linked accounts (session proves identity). */
  deleteAccount(password, accessToken) {
    const body = {}
    if (password != null && String(password).trim() !== '') {
      body.password = String(password).trim()
    }
    return request('POST', '/api/auth/delete-account', body, true, accessToken)
  },
}

export { getApiBaseUrl }
