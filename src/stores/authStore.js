import { create } from 'zustand'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { isLocalApiAuthMode, API_AUTH_STORAGE_KEY } from '../lib/authMode'
import { authApi } from '../api/auth'
import { userApi } from '../api/user'
import { resetClientCachesForUserChange, LAST_AUTH_USER_ID_KEY } from '../lib/sessionReset'

let authListenerBound = false
let ensureSessionInFlight = null
let accessTokenInFlight = null

function mapUser(u) {
  if (!u) return null
  return {
    id: u.id,
    email: u.email,
    user_metadata: u.user_metadata,
    app_metadata: u.app_metadata,
  }
}

function mapApiUser(u) {
  if (!u) return null
  const role = u.role || 'user'
  return {
    id: String(u.id),
    email: u.email,
    role,
    ban_reason: u.ban_reason,
    ban_date: u.ban_date,
    user_metadata: {},
    app_metadata: {},
  }
}

function loadApiAuthFromStorage() {
  try {
    const raw = localStorage.getItem(API_AUTH_STORAGE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (!o?.accessToken || !o?.refreshToken) return null
    return o
  } catch {
    return null
  }
}

function saveApiAuthToStorage(payload) {
  try {
    if (payload) localStorage.setItem(API_AUTH_STORAGE_KEY, JSON.stringify(payload))
    else localStorage.removeItem(API_AUTH_STORAGE_KEY)
  } catch {
    /* ignore */
  }
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

function sessionToState(session) {
  if (!session) {
    return { user: null, accessToken: null, refreshToken: null, expiresAt: null }
  }
  const exp = session.expires_at ? session.expires_at * 1000 : null
  return {
    user: mapUser(session.user),
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: exp,
  }
}

export function bindSupabaseAuthListener() {
  if (isLocalApiAuthMode() || authListenerBound || !supabase) return
  authListenerBound = true
  supabase.auth.onAuthStateChange((event, session) => {
    useAuthStore.getState()._applySession(session)
    if (event === 'PASSWORD_RECOVERY' && typeof window !== 'undefined') {
      window.location.hash = 'reset-password'
    }
  })
}

export const useAuthStore = create((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  isLoading: false,
  error: null,
  _refreshIntervalId: null,

  _applyApiSession(accessToken, refreshToken, expiresInSeconds, user) {
    const exp = Date.now() + (expiresInSeconds || 900) * 1000
    const nextUser = mapApiUser(user)
    const nextUserId = nextUser?.id ?? null
    touchLastUserId(nextUserId)
    saveApiAuthToStorage({
      accessToken,
      refreshToken,
      expiresAt: exp,
      user,
    })
    set({
      user: nextUser,
      accessToken,
      refreshToken,
      expiresAt: exp,
      error: null,
    })
    get()._startApiRefreshTimer()
  },

  _applySession(session) {
    const next = sessionToState(session)
    const nextUserId = session?.user?.id ?? null
    touchLastUserId(nextUserId)
    set({ ...next, error: null })
    if (session?.refresh_token) {
      get()._startProactiveRefresh()
    } else {
      get()._stopProactiveRefresh()
    }
  },

  _stopProactiveRefresh() {
    const id = get()._refreshIntervalId
    if (id) {
      clearInterval(id)
      set({ _refreshIntervalId: null })
    }
  },

  _startApiRefreshTimer() {
    if (!isLocalApiAuthMode()) return
    get()._stopProactiveRefresh()
    const id = setInterval(async () => {
      const { expiresAt, refreshToken } = get()
      if (!refreshToken || !expiresAt || Date.now() < expiresAt - 120000) return
      try {
        const data = await authApi.refresh(refreshToken)
        get()._applyApiSession(data.access_token, data.refresh_token, data.expires_in, data.user)
      } catch {
        /* keep session until API returns 401 */
      }
    }, 60000)
    set({ _refreshIntervalId: id })
  },

  _startProactiveRefresh() {
    if (isLocalApiAuthMode()) {
      get()._startApiRefreshTimer()
      return
    }
    if (get()._refreshIntervalId || !supabase) return
    const id = setInterval(async () => {
      const { expiresAt } = get()
      if (!expiresAt || Date.now() < expiresAt - 120000) return
      const { data, error } = await supabase.auth.refreshSession()
      if (error || !data.session) return
      get()._applySession(data.session)
    }, 60000)
    set({ _refreshIntervalId: id })
  },

  loadSession() {
    if (isLocalApiAuthMode()) {
      const s = loadApiAuthFromStorage()
      if (s?.accessToken) {
        get()._applyApiSession(
          s.accessToken,
          s.refreshToken,
          Math.max(60, Math.round((s.expiresAt - Date.now()) / 1000)),
          s.user
        )
      } else {
        set({ user: null, accessToken: null, refreshToken: null, expiresAt: null })
      }
      return
    }
    if (!supabase) {
      set({ user: null, accessToken: null, refreshToken: null, expiresAt: null })
      return
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      get()._applySession(session)
    })
  },

  setSession(accessToken, refreshToken, expiresIn, user) {
    set({
      accessToken,
      refreshToken,
      expiresAt: Date.now() + (expiresIn || 900) * 1000,
      user,
      error: null,
    })
  },

  clearSession() {
    get()._stopProactiveRefresh()
    set({ user: null, accessToken: null, refreshToken: null, expiresAt: null, error: null })
  },

  clearError() {
    set({ error: null })
  },

  ensureSession: async () => {
    if (isLocalApiAuthMode()) {
      if (ensureSessionInFlight) return ensureSessionInFlight
      ensureSessionInFlight = (async () => {
        const stored = loadApiAuthFromStorage()
        if (!stored?.refreshToken) {
          get().clearSession()
          return
        }
        if (stored.accessToken && stored.expiresAt && Date.now() < stored.expiresAt - 60000) {
          get()._applyApiSession(
            stored.accessToken,
            stored.refreshToken,
            Math.max(60, Math.round((stored.expiresAt - Date.now()) / 1000)),
            stored.user
          )
          return
        }
        try {
          const data = await authApi.refresh(stored.refreshToken)
          get()._applyApiSession(data.access_token, data.refresh_token, data.expires_in, data.user)
        } catch {
          saveApiAuthToStorage(null)
          get().clearSession()
        }
      })()
      try {
        await ensureSessionInFlight
      } finally {
        ensureSessionInFlight = null
      }
      return
    }

    if (!isSupabaseConfigured() || !supabase) {
      set({ user: null, accessToken: null, refreshToken: null, expiresAt: null })
      return
    }
    bindSupabaseAuthListener()
    if (ensureSessionInFlight) return ensureSessionInFlight
    ensureSessionInFlight = (async () => {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession()
      if (error) {
        get().clearSession()
        return
      }
      get()._applySession(session)
    })()
    try {
      await ensureSessionInFlight
    } finally {
      ensureSessionInFlight = null
    }
  },

  getValidAccessToken: async () => {
    if (isLocalApiAuthMode()) {
      const { accessToken: mem, expiresAt, refreshToken } = get()
      if (mem && expiresAt && Date.now() < expiresAt - 60000) {
        return mem
      }
      if (accessTokenInFlight) return accessTokenInFlight
      accessTokenInFlight = (async () => {
        if (!refreshToken) return null
        try {
          if (!mem || !expiresAt || Date.now() >= expiresAt - 60000) {
            const data = await authApi.refresh(refreshToken)
            get()._applyApiSession(
              data.access_token,
              data.refresh_token,
              data.expires_in,
              data.user
            )
            return data.access_token
          }
          return mem
        } catch {
          saveApiAuthToStorage(null)
          get().clearSession()
          return null
        }
      })()
      try {
        return await accessTokenInFlight
      } finally {
        accessTokenInFlight = null
      }
    }

    if (!supabase) return null
    const { accessToken: mem, expiresAt } = get()
    if (mem && expiresAt && Date.now() < expiresAt - 60000) {
      return mem
    }
    if (accessTokenInFlight) return accessTokenInFlight
    accessTokenInFlight = (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return null
      const exp = session.expires_at ? session.expires_at * 1000 : 0
      if (exp && Date.now() > exp - 60000) {
        const { data, error } = await supabase.auth.refreshSession()
        if (!error && data.session) {
          get()._applySession(data.session)
          return data.session.access_token
        }
      }
      get()._applySession(session)
      return session.access_token
    })()
    try {
      return await accessTokenInFlight
    } finally {
      accessTokenInFlight = null
    }
  },

  login: async (email, password) => {
    if (isLocalApiAuthMode()) {
      set({ isLoading: true, error: null })
      try {
        const data = await authApi.login(email.trim(), password)
        get()._applyApiSession(data.access_token, data.refresh_token, data.expires_in, data.user)
        if (data.user?.role === 'banned') {
          return {
            ok: true,
            isBanned: true,
            banInfo: {
              ban_date: data.user.ban_date,
              ban_reason: data.user.ban_reason,
            },
          }
        }
        return { ok: true }
      } catch (err) {
        const message = err?.message || 'Invalid email or password'

        const apiCode = err?.code || err?.body?.error?.code
        const extra = err?.extra || err?.body?.error?.extra
        if (err?.status === 403 && apiCode === 'ACCOUNT_BANNED') {
          const banInfo = extra || { is_banned: true, ban_reason: 'Violation of terms of service' }
          set({ error: 'Your account has been suspended', isLoading: false })
          return { ok: false, error: 'Account suspended', isBanned: true, banInfo }
        }

        set({ error: message })
        return { ok: false, error: message }
      } finally {
        set({ isLoading: false })
      }
    }
    if (!supabase) {
      set({
        error:
          'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, or use local API auth (dev default).',
      })
      return { ok: false, error: get().error }
    }
    set({ isLoading: true, error: null })
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) {
        const msg =
          error.message === 'Email not confirmed'
            ? 'Please confirm your email first. Check your inbox or use "Resend confirmation".'
            : error.message

        // Check if user is banned
        if (
          error.message.toLowerCase().includes('banned') ||
          error.message.toLowerCase().includes('suspended')
        ) {
          set({ error: 'Your account has been suspended', isLoading: false })
          return {
            ok: false,
            error: 'Account suspended',
            isBanned: true,
            banInfo: { is_banned: true, ban_reason: 'Violation of terms of service' },
          }
        }

        set({ error: msg })
        return {
          ok: false,
          error: msg,
          needsEmailConfirmation: error.message === 'Email not confirmed',
        }
      }
      get()._applySession(data.session)
      return { ok: true }
    } catch (err) {
      const message = err?.message || 'Sign in failed.'
      set({ error: message })
      return { ok: false, error: message }
    } finally {
      set({ isLoading: false })
    }
  },

  signInWithGoogle: async () => {
    if (isLocalApiAuthMode()) {
      set({
        error:
          'Google sign-in uses Supabase. Set VITE_USE_LOCAL_API_AUTH=false and configure Supabase, or sign in with email.',
      })
      return { ok: false, error: get().error }
    }
    if (!supabase) {
      set({ error: 'Supabase is not configured.' })
      return { ok: false }
    }
    set({ isLoading: true, error: null })
    try {
      const redirectTo = `${window.location.origin}${window.location.pathname}`
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      })
      if (error) {
        set({ error: error.message })
        return { ok: false, error: error.message }
      }
      return { ok: true }
    } catch (err) {
      const message = err?.message || 'Google sign-in failed.'
      set({ error: message })
      return { ok: false, error: message }
    } finally {
      set({ isLoading: false })
    }
  },

  resendSignupEmail: async (email) => {
    if (isLocalApiAuthMode()) {
      set({ error: 'Email confirmation is not used for local API accounts.' })
      return { ok: false, error: get().error }
    }
    if (!supabase) {
      set({ error: 'Supabase is not configured.' })
      return { ok: false, error: 'Not configured' }
    }
    set({ error: null })
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/` },
    })
    if (error) {
      set({ error: error.message })
      return { ok: false, error: error.message }
    }
    return { ok: true }
  },

  register: async (email, password, username = null) => {
    if (isLocalApiAuthMode()) {
      set({ isLoading: true, error: null })
      try {
        await authApi.register(email.trim(), password, username)
        const data = await authApi.login(email.trim(), password)
        get()._applyApiSession(data.access_token, data.refresh_token, data.expires_in, data.user)
        return { ok: true, needsEmailConfirmation: false }
      } catch (err) {
        const message = err?.message || 'Registration failed.'
        set({ error: message })
        return { ok: false, error: message }
      } finally {
        set({ isLoading: false })
      }
    }
    if (!supabase) {
      set({ error: 'Supabase is not configured.' })
      return { ok: false, error: get().error }
    }
    set({ isLoading: true, error: null })
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      })
      if (error) {
        set({ error: error.message })
        return { ok: false, error: error.message }
      }
      const needsEmailConfirmation = !data.session
      if (data.session) {
        get()._applySession(data.session)
      }
      return { ok: true, needsEmailConfirmation }
    } catch (err) {
      const message = err?.message || 'Registration failed.'
      set({ error: message })
      return { ok: false, error: message }
    } finally {
      set({ isLoading: false })
    }
  },

  logout: async () => {
    if (isLocalApiAuthMode()) {
      const rt = get().refreshToken
      if (rt) {
        try {
          await authApi.logout(rt)
        } catch {
          /* ignore */
        }
      }
      saveApiAuthToStorage(null)
      resetClientCachesForUserChange()
      get().clearSession()
      return
    }
    if (supabase) {
      try {
        await supabase.auth.signOut()
      } catch {
        /* ignore */
      }
    }
    resetClientCachesForUserChange()
    get().clearSession()
  },

  forgotPassword: async (email) => {
    if (isLocalApiAuthMode()) {
      set({ isLoading: true, error: null })
      try {
        await authApi.forgotPassword(email.trim())
        return { ok: true }
      } catch (err) {
        const message = err?.message || 'Could not send reset email.'
        set({ error: message })
        return { ok: false, error: message }
      } finally {
        set({ isLoading: false })
      }
    }
    if (!supabase) {
      set({ error: 'Supabase is not configured.' })
      return { ok: false }
    }
    set({ isLoading: true, error: null })
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/#reset-password`,
      })
      if (error) {
        set({ error: error.message })
        return { ok: false, error: error.message }
      }
      return { ok: true }
    } catch (err) {
      const message = err?.message || 'Could not send reset email.'
      set({ error: message })
      return { ok: false, error: message }
    } finally {
      set({ isLoading: false })
    }
  },

  resetPassword: async (token, newPassword) => {
    if (isLocalApiAuthMode()) {
      if (!token || !String(token).trim()) {
        set({ error: 'Reset link is invalid or expired.' })
        return { ok: false, error: get().error }
      }
      set({ isLoading: true, error: null })
      try {
        await authApi.resetPassword(String(token).trim(), newPassword)
        return { ok: true }
      } catch (err) {
        const message = err?.message || 'Password reset failed.'
        set({ error: message })
        return { ok: false, error: message }
      } finally {
        set({ isLoading: false })
      }
    }
    if (!supabase) return { ok: false, error: 'Not configured' }
    set({ isLoading: true, error: null })
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        set({ error: error.message })
        return { ok: false, error: error.message }
      }
      return { ok: true }
    } catch (err) {
      const message = err?.message || 'Password reset failed.'
      set({ error: message })
      return { ok: false, error: message }
    } finally {
      set({ isLoading: false })
    }
  },

  changePassword: async (currentPassword, newPassword) => {
    if (isLocalApiAuthMode()) {
      set({ isLoading: true, error: null })
      try {
        const token = await get().getValidAccessToken()
        if (!token) {
          set({ error: 'Not signed in.' })
          return { ok: false, error: 'Not signed in.' }
        }
        await authApi.changePassword(currentPassword, newPassword, token)
        return { ok: true }
      } catch (err) {
        const message = err?.message || 'Failed to change password.'
        set({ error: message })
        return { ok: false, error: message }
      } finally {
        set({ isLoading: false })
      }
    }
    if (!supabase) return { ok: false, error: 'Not configured' }
    set({ isLoading: true, error: null })
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user?.email) {
        set({ error: 'Not signed in.' })
        return { ok: false, error: 'Not signed in.' }
      }
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      })
      if (signErr) {
        set({ error: 'Current password is incorrect.' })
        return { ok: false, error: 'Current password is incorrect.' }
      }
      const { error: updErr } = await supabase.auth.updateUser({ password: newPassword })
      if (updErr) {
        set({ error: updErr.message })
        return { ok: false, error: updErr.message }
      }
      return { ok: true }
    } catch (err) {
      const message = err?.message || 'Failed to change password.'
      set({ error: message })
      return { ok: false, error: message }
    } finally {
      set({ isLoading: false })
    }
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

  deleteAccount: async (password) => {
    set({ isLoading: true, error: null })
    try {
      const token = await get().getValidAccessToken()
      if (!token) return { ok: false, error: 'Not signed in.' }
      await authApi.deleteAccount(password, token)
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

  allowsPasswordlessAccountDelete: () => !isLocalApiAuthMode(),

  refreshSession: async () => {
    if (isLocalApiAuthMode()) {
      const rt = get().refreshToken
      if (!rt) return
      try {
        const data = await authApi.refresh(rt)
        get()._applyApiSession(data.access_token, data.refresh_token, data.expires_in, data.user)
      } catch {
        /* ignore */
      }
      return
    }
    if (!supabase) return
    const { data, error } = await supabase.auth.refreshSession()
    if (!error && data.session) get()._applySession(data.session)
  },
}))

// Restore local API session before first paint so banned users never flash dashboard/shell loading.
if (typeof window !== 'undefined' && isLocalApiAuthMode()) {
  try {
    useAuthStore.getState().loadSession()
  } catch {
    /* ignore */
  }
}
