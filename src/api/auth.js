/**
 * Auth API client — login, register, refresh, logout.
 * In dev: use same origin ('') so Vite proxy forwards /api to the backend (avoids CORS OPTIONS).
 * In production: VITE_API_BASE_URL or fallback inferred from window.location.
 */

import { apiFetch, getApiBaseUrl } from '../lib/apiFetch.js'

/**
 * Auth endpoints are public (no bearer) — except change-password /
 * delete-account which take an explicit token. We pass `token` through
 * to apiFetch verbatim (`null` → anonymous, string → bearer) so the
 * store's auto-resolution never kicks in for the unauthenticated routes.
 *
 * Pydantic validation errors arrive as `{detail: [{loc, msg, type}, ...]}`.
 * parseApiError handles the unified envelope + object-shaped `detail`, but
 * not the array form, so we post-process here to surface the first field
 * message (e.g. "password too short") instead of a generic fallback.
 */
async function authRequest(method, path, body, token = null) {
  try {
    return await apiFetch(path, { method, body, token })
  } catch (err) {
    const detail = err?.body?.detail
    if (Array.isArray(detail) && detail[0] && typeof detail[0].msg === 'string') {
      err.serverMessage = detail[0].msg
      err.message = detail[0].msg
    }
    throw err
  }
}

export const authApi = {
  login(email, password) {
    return authRequest('POST', '/api/auth/login', { email, password })
  },
  register(email, password, username = null) {
    return authRequest('POST', '/api/auth/register', { email, password, username })
  },
  refresh(refreshToken) {
    return authRequest('POST', '/api/auth/refresh', { refresh_token: refreshToken })
  },
  logout(refreshToken) {
    return authRequest('POST', '/api/auth/logout', { refresh_token: refreshToken })
  },
  forgotPassword(email) {
    return authRequest('POST', '/api/auth/forgot-password', { email })
  },
  resetPassword(token, newPassword) {
    return authRequest('POST', '/api/auth/reset-password', { token, new_password: newPassword })
  },
  changePassword(currentPassword, newPassword, accessToken) {
    return authRequest(
      'POST',
      '/api/auth/change-password',
      { current_password: currentPassword, new_password: newPassword },
      accessToken
    )
  },
  /** Permanently delete account. Password optional for Cognito-linked accounts (session proves identity). */
  deleteAccount(password, accessToken) {
    const body = {}
    if (password != null && String(password).trim() !== '') {
      body.password = String(password).trim()
    }
    return authRequest('POST', '/api/auth/delete-account', body, accessToken)
  },
}

export { getApiBaseUrl }
