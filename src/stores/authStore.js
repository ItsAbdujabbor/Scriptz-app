import { create } from 'zustand'
import {
  buildAuthorizeUrl,
  clearSession,
  consumeOAuthCallback,
  loadSession,
  refreshSession,
} from '../lib/oauthClient'
import { authApi } from '../api/auth'
import { userApi } from '../api/user'
import { resetClientCachesForUserChange, LAST_AUTH_USER_ID_KEY } from '../lib/sessionReset'
import { rumSetUser, rumClearUser } from '../lib/rum'
import { identify, track } from '../lib/analytics'

let ensureSessionInFlight = null
let accessTokenInFlight = null

function tokensExpired(expiresAt, leewayMs = 60_000) {
  if (!expiresAt) return true
  return Date.now() >= expiresAt - leewayMs
}

function touchLastUserId(nextUserId) {
  if (typeof localStorage === 'undefined') return
  const last = localStorage.getItem(LAST_AUTH_USER_ID_KEY)
  if (nextUserId) {
    if (last != null && last !== String(nextUserId)) {
      resetClientCachesForUserChange()
    }
    localStorage.setItem(LAST_AUTH_USER_ID_KEY, String(nextUserId))
  } else {
    if (last != null) {
      resetClientCachesForUserChange()
    }
    localStorage.removeItem(LAST_AUTH_USER_ID_KEY)
  }
}

function mapUser(u) {
  if (!u) return null
  return {
    id: String(u.id),
    email: u.email || null,
    role: u.role || 'user',
    is_active: u.is_active !== false,
    ban_reason: u.ban_reason || null,
    ban_date: u.ban_date || null,
    user_metadata: {},
    app_metadata: {},
  }
}

export const useAuthStore = create((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  isLoading: false,
  error: null,
  _refreshIntervalId: null,

  _applySession(session) {
    if (!session) {
      get()._stopProactiveRefresh()
      touchLastUserId(null)
      set({ user: null, accessToken: null, refreshToken: null, expiresAt: null })
      rumClearUser()
      return
    }
    const user = mapUser(session.user)
    // Only stamp the last-user-id when we actually got a user payload.
    // Passing null here would call `touchLastUserId(null)`, which (if a
    // previous id is on disk) triggers `resetClientCachesForUserChange()`
    // — and THAT wipes the just-written session token. Tokens-without-user
    // is a rare backend edge case; treat it as "keep the current
    // last-user-id intact" instead of as a logout.
    if (user?.id) {
      touchLastUserId(user.id)
    }
    set({
      user,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      error: null,
    })
    if (user) {
      rumSetUser(user)
      identify(user)
      // Client-side login signal. The backend will also emit a server-side
      // signup/login event from auth_oauth — that one is authoritative; this
      // one just keeps the session_id stitched to the user_id on the client.
      track('client_session_authenticated', { user_id: user.id })
    }
    get()._startProactiveRefresh()
  },

  clearSession() {
    get()._stopProactiveRefresh()
    clearSession()
    touchLastUserId(null)
    set({ user: null, accessToken: null, refreshToken: null, expiresAt: null, error: null })
    rumClearUser()
    identify(null)
    track('client_session_cleared')
  },

  clearError() {
    set({ error: null })
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
    const id = setInterval(async () => {
      const { refreshToken, expiresAt } = get()
      if (!refreshToken || !expiresAt) return
      if (Date.now() < expiresAt - 120_000) return
      const next = await refreshSession(refreshToken)
      if (next) get()._applySession(next)
    }, 60_000)
    set({ _refreshIntervalId: id })
  },

  /**
   * Called once on app boot. If we just landed on the OAuth callback
   * (`?code=...`), exchange it via the backend. Otherwise restore
   * tokens from localStorage and refresh if expired.
   */
  loadSession: async () => {
    try {
      const fromCallback = await consumeOAuthCallback()
      if (fromCallback) {
        get()._applySession(fromCallback)
        return
      }
    } catch (err) {
      set({ error: err?.message || 'Sign-in failed.' })
      // fall through to restore-from-storage
    }
    const stored = loadSession()
    if (!stored) {
      set({ user: null, accessToken: null, refreshToken: null, expiresAt: null })
      return
    }
    if (tokensExpired(stored.expiresAt) && stored.refreshToken) {
      const next = await refreshSession(stored.refreshToken)
      if (next) {
        get()._applySession(next)
        return
      }
      get().clearSession()
      return
    }
    get()._applySession(stored)
  },

  ensureSession: async () => {
    if (ensureSessionInFlight) return ensureSessionInFlight
    ensureSessionInFlight = (async () => {
      await get().loadSession()
    })()
    try {
      await ensureSessionInFlight
    } finally {
      ensureSessionInFlight = null
    }
  },

  /**
   * Returns a fresh access token (refreshes if near expiry).
   * Used by the fetch wrapper / TanStack Query bridge.
   */
  getValidAccessToken: async () => {
    const { accessToken, expiresAt, refreshToken } = get()
    if (accessToken && !tokensExpired(expiresAt)) return accessToken
    if (!refreshToken) return null
    if (accessTokenInFlight) return accessTokenInFlight
    accessTokenInFlight = (async () => {
      const next = await refreshSession(refreshToken)
      if (!next) {
        get().clearSession()
        return null
      }
      get()._applySession(next)
      return next.accessToken
    })()
    try {
      return await accessTokenInFlight
    } finally {
      accessTokenInFlight = null
    }
  },

  signInWithGoogle: (intent) => get()._startOAuth('google', intent),

  _startOAuth: async (provider, intent) => {
    set({ isLoading: true, error: null })
    try {
      // Persist that an auth dialog was open before the OAuth redirect, so
      // the post-redirect callback re-mounts the dialog with a loading
      // overlay (instead of a generic full-screen splash). The exact intent
      // string doesn't matter to App.jsx — it just checks for *any* value
      // under this key — so we accept 'signin' (unified dialog) as well as
      // the legacy 'login' / 'signup' values.
      if (intent === 'signin' || intent === 'login' || intent === 'signup') {
        const { setOAuthIntent } = await import('../lib/oauthClient')
        // setOAuthIntent only stores 'login' | 'signup'; normalize 'signin'
        // to 'signup' (welcome-splash defaults are friendly to new users).
        setOAuthIntent(intent === 'signin' ? 'signup' : intent)
      }
      const url = await buildAuthorizeUrl(provider)
      window.location.assign(url)
      return { ok: true }
    } catch (err) {
      const message = err?.message || 'Google sign-in failed.'
      set({ error: message, isLoading: false })
      return { ok: false, error: message }
    }
  },

  logout: async () => {
    const rt = get().refreshToken
    if (rt) {
      try {
        await authApi.logout(rt)
      } catch {
        /* ignore — backend may have already revoked */
      }
    }
    resetClientCachesForUserChange()
    get().clearSession()
  },

  deleteData: async () => {
    set({ isLoading: true, error: null })
    try {
      const token = await get().getValidAccessToken()
      if (!token) return { ok: false, error: 'Not signed in.' }
      await userApi.deleteData(token)
      return { ok: true }
    } catch (err) {
      const message = err?.message || 'Failed to delete data.'
      set({ error: message })
      return { ok: false, error: message }
    } finally {
      set({ isLoading: false })
    }
  },

  /**
   * Permanently delete the local user row. The upstream Google identity
   * is unaffected — re-signing in creates a fresh local row.
   */
  deleteAccount: async () => {
    set({ isLoading: true, error: null })
    try {
      const token = await get().getValidAccessToken()
      if (!token) return { ok: false, error: 'Not signed in.' }
      await authApi.deleteAccount(undefined, token)
      await get().logout()
      return { ok: true }
    } catch (err) {
      const message = err?.message || 'Failed to delete account.'
      set({ error: message })
      return { ok: false, error: message }
    } finally {
      set({ isLoading: false })
    }
  },

  // OAuth-federated sessions don't need a password to delete the local row.
  allowsPasswordlessAccountDelete: () => true,

  refreshSession: async () => {
    const { refreshToken } = get()
    if (!refreshToken) return
    const next = await refreshSession(refreshToken)
    if (next) get()._applySession(next)
  },
}))
