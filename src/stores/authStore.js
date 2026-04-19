import { create } from 'zustand'
import { authApi } from '../api/auth'
import { userApi } from '../api/user'

const STORAGE_KEY = 'scriptz_auth'
const REFRESH_BEFORE_MS = 2 * 60 * 1000  // refresh if token expires in < 2 min
const PROACTIVE_REFRESH_INTERVAL_MS = 60 * 1000  // check every 60s

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveStored(data) {
  try {
    if (data) localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

export const useAuthStore = create((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  isLoading: false,
  error: null,
  _refreshIntervalId: null,

  loadSession() {
    const d = loadStored()
    if (!d || !d.access_token) {
      set({ user: null, accessToken: null, refreshToken: null, expiresAt: null })
      return
    }
    set({
      user: d.user ?? null,
      accessToken: d.access_token,
      refreshToken: d.refresh_token ?? null,
      expiresAt: d.expires_at ?? null,
    })
  },

  setSession(accessToken, refreshToken, expiresIn, user) {
    const now = Date.now()
    const exp = typeof expiresIn === 'number' ? expiresIn : 900
    const data = {
      access_token: accessToken,
      refresh_token: refreshToken ?? get().refreshToken,
      expires_in: exp,
      expires_at: now + exp * 1000,
      user: user ?? get().user,
    }
    saveStored(data)
    set({
      user: data.user,
      accessToken,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
      error: null,
    })
    get()._startProactiveRefresh()
  },

  clearSession() {
    get()._stopProactiveRefresh()
    saveStored(null)
    set({ user: null, accessToken: null, refreshToken: null, expiresAt: null, error: null, _refreshIntervalId: null })
  },

  _stopProactiveRefresh() {
    const id = get()._refreshIntervalId
    if (id) {
      clearInterval(id)
      set({ _refreshIntervalId: null })
    }
  },

  _startProactiveRefresh() {
    if (get()._refreshIntervalId) return
    if (!get().refreshToken) return
    const id = setInterval(() => {
      const { expiresAt, refreshToken } = get()
      if (!refreshToken || !expiresAt) return
      if (Date.now() < expiresAt - REFRESH_BEFORE_MS) return
      get().refreshSession().catch(() => get().clearSession())
    }, PROACTIVE_REFRESH_INTERVAL_MS)
    set({ _refreshIntervalId: id })
  },

  /** Refresh access token using refresh_token; updates stored session. */
  refreshSession: async () => {
    const refresh = get().refreshToken
    if (!refresh) return
    const res = await authApi.refresh(refresh)
    get().setSession(res.access_token, res.refresh_token ?? refresh, res.expires_in, res.user)
  },

  /**
   * Call after loadSession() on app init: restore session, refresh if expired, start proactive refresh.
   * Keeps the user logged in across reloads and refreshes tokens before they expire.
   */
  ensureSession: async () => {
    get().loadSession()
    const { accessToken, refreshToken, expiresAt } = get()
    if (!refreshToken) return
    const now = Date.now()
    const expired = !expiresAt || now >= expiresAt - 60000
    if (expired || !accessToken) {
      try {
        await get().refreshSession()
      } catch {
        get().clearSession()
      }
      return
    }
    get()._startProactiveRefresh()
  },

  /**
   * Returns a Promise that resolves with a valid access token (refreshing if needed). Use for API calls.
   */
  getValidAccessToken: async () => {
    const { accessToken, refreshToken, expiresAt } = get()
    const now = Date.now()
    const stillValid = accessToken && expiresAt && now < expiresAt - 60000
    if (stillValid) return accessToken
    if (!refreshToken) return null
    await get().refreshSession()
    return get().accessToken
  },

  clearError() {
    set({ error: null })
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      const res = await authApi.login(email, password)
      get().setSession(res.access_token, res.refresh_token, res.expires_in, res.user)
      return { ok: true }
    } catch (err) {
      const message = err?.message || 'Sign in failed. Please try again.'
      set({ error: message })
      return { ok: false, error: message }
    } finally {
      set({ isLoading: false })
    }
  },

  register: async (email, password, username = null) => {
    set({ isLoading: true, error: null })
    try {
      await authApi.register(email, password, username)
      return { ok: true }
    } catch (err) {
      const message = err?.message || 'Registration failed. Please try again.'
      set({ error: message })
      return { ok: false, error: message }
    } finally {
      set({ isLoading: false })
    }
  },

  logout: async () => {
    const refresh = get().refreshToken
    if (refresh) {
      try {
        await authApi.logout(refresh)
      } catch {}
    }
    get().clearSession()
  },

  forgotPassword: async (email) => {
    set({ isLoading: true, error: null })
    try {
      await authApi.forgotPassword(email)
      return { ok: true }
    } catch (err) {
      const message = err?.message || 'Could not send reset email. Please try again.'
      set({ error: message })
      return { ok: false, error: message }
    } finally {
      set({ isLoading: false })
    }
  },

  resetPassword: async (token, newPassword) => {
    set({ isLoading: true, error: null })
    try {
      await authApi.resetPassword(token, newPassword)
      return { ok: true }
    } catch (err) {
      const message = err?.message || 'Password reset failed. Please try again or request a new link.'
      set({ error: message })
      return { ok: false, error: message }
    } finally {
      set({ isLoading: false })
    }
  },

  changePassword: async (currentPassword, newPassword) => {
    set({ isLoading: true, error: null })
    try {
      const token = await get().getValidAccessToken()
      if (!token) return { ok: false, error: 'Not signed in.' }
      await authApi.changePassword(currentPassword, newPassword, token)
      return { ok: true }
    } catch (err) {
      if (err?.status === 401) {
        try {
          await get().refreshSession()
          const token = get().accessToken
          if (token) {
            await authApi.changePassword(currentPassword, newPassword, token)
            return { ok: true }
          }
        } catch {}
        get().clearSession()
      }
      const message = err?.message || 'Failed to change password. Please try again.'
      set({ error: message })
      return { ok: false, error: message }
    } finally {
      set({ isLoading: false })
    }
  },

  /** Delete all user data on the server (preferences, content). Account remains. */
  deleteData: async () => {
    set({ isLoading: true, error: null })
    try {
      const token = await get().getValidAccessToken()
      if (!token) return { ok: false, error: 'Not signed in.' }
      await userApi.deleteData(token)
      return { ok: true }
    } catch (err) {
      const message = err?.message || 'Failed to delete data. Please try again.'
      set({ error: message })
      return { ok: false, error: message }
    } finally {
      set({ isLoading: false })
    }
  },

  /** Permanently delete account. Requires password. Clears session on success. */
  deleteAccount: async (password) => {
    set({ isLoading: true, error: null })
    try {
      const token = await get().getValidAccessToken()
      if (!token) return { ok: false, error: 'Not signed in.' }
      await authApi.deleteAccount(password, token)
      get().clearSession()
      return { ok: true }
    } catch (err) {
      const message = err?.message || 'Failed to delete account. Please check your password and try again.'
      set({ error: message })
      return { ok: false, error: message }
    } finally {
      set({ isLoading: false })
    }
  },
}))
