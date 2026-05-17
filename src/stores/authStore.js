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

// AUTH-06: the proactive-refresh interval handle lives at module scope,
// NOT in Zustand state. An interval id is a non-serializable runtime
// handle — keeping it in the store leaked it into any state snapshot /
// devtools / persisted dump and meant a `set()` could clobber it.
let _proactiveRefreshInterval = null

// AUTH-04: guards the logout-while-refresh race. `clearSession()` sets
// this true and any in-flight `refreshSession()` promise that resolves
// AFTER the clear must NOT call `_applySession` (that would resurrect a
// session the user just logged out of). `_applySession` resets it to
// false for the next legitimate sign-in.
let _sessionCleared = false

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

  _applySession(session) {
    if (!session) {
      get()._stopProactiveRefresh()
      touchLastUserId(null)
      set({ user: null, accessToken: null, refreshToken: null, expiresAt: null })
      rumClearUser()
      return
    }
    // AUTH-04: if the session was cleared (logout) while a refresh was
    // still in flight, that refresh's late resolution must NOT revive
    // the session. Drop it silently — the user explicitly logged out.
    if (_sessionCleared) return
    // A legitimate new session is being applied — re-arm the guard so a
    // future logout can once again block a stale in-flight refresh.
    _sessionCleared = false
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
    // AUTH-04: set the guard FIRST, before anything async can interleave.
    // Any `refreshSession()` promise already in flight (proactive-refresh
    // tick, getValidAccessToken) will resolve later; the guard makes its
    // `_applySession` a no-op so a logged-out session can't be revived.
    _sessionCleared = true
    // Drop the in-flight promise handles so a subsequent sign-in starts
    // a fresh refresh rather than awaiting a stale one bound to the old
    // refresh token.
    accessTokenInFlight = null
    ensureSessionInFlight = null
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

  // AUTH-06: interval handle is a module-level closure variable, never
  // Zustand state. `set()` must only ever carry serializable session
  // data.
  _stopProactiveRefresh() {
    if (_proactiveRefreshInterval) {
      clearInterval(_proactiveRefreshInterval)
      _proactiveRefreshInterval = null
    }
  },

  _startProactiveRefresh() {
    if (_proactiveRefreshInterval) return // already running
    _proactiveRefreshInterval = setInterval(async () => {
      const { refreshToken, expiresAt } = get()
      if (!refreshToken || !expiresAt) return
      if (Date.now() < expiresAt - 120_000) return
      const next = await refreshSession(refreshToken)
      // 'invalid' = backend revoked the refresh token; clear session.
      // null      = transient (network/5xx); keep session, retry next tick.
      // object    = success; apply it. (`_applySession` itself no-ops if
      //             the session was cleared mid-refresh — AUTH-04.)
      if (next === 'invalid') {
        get().clearSession()
      } else if (next) {
        get()._applySession(next)
      }
    }, 60_000)
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
      if (next === 'invalid') {
        // Refresh token is dead — wipe locally.
        get().clearSession()
        return
      }
      if (next) {
        get()._applySession(next)
        return
      }
      // Transient failure (network / 5xx). Keep what we have; the next
      // API call will retry. This avoids the "browser came back from
      // sleep and got bumped to login because CloudFront returned a
      // single 502" pathology.
      get()._applySession(stored)
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
      if (next === 'invalid') {
        // Backend revoked the refresh token (logout from another tab,
        // 30-day rotation expiry, etc.) — clear session.
        get().clearSession()
        return null
      }
      if (!next) {
        // Transient failure (network blip, 5xx, multi-tab rotation race).
        // Don't clear the session — return the stale access token so the
        // caller can fall through. Next call will try again.
        return accessToken || null
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
