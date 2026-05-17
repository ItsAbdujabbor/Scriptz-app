/**
 * Direct OAuth client — Google, PKCE.
 *
 * Flow:
 *   1. buildAuthorizeUrl(provider) generates a PKCE verifier + state, stashes
 *      them in sessionStorage, and returns Google's authorize URL.
 *   2. The browser is redirected; the user authenticates at Google.
 *   3. Google redirects back to the SPA at `?code=...&state=...`.
 *   4. consumeOAuthCallback() POSTs the code to the backend
 *      `/api/auth/oauth/google` endpoint. The backend does the token
 *      exchange (it has the client secret) and returns our internal JWTs.
 *   5. Caller stores the returned `{access_token, refresh_token, user, expires_in}`.
 *
 * No SDK; no Cognito; no AWS deployment dependency.
 */

import { getApiBaseUrl } from './env.js'

const env = typeof import.meta !== 'undefined' ? import.meta.env : {}
const GOOGLE_CLIENT_ID = (env.VITE_GOOGLE_CLIENT_ID || '').trim()

const TOKENS_STORAGE_KEY = 'clixa_session'
const PKCE_VERIFIER_KEY = 'clixa_oauth_pkce'
const OAUTH_STATE_KEY = 'clixa_oauth_state'
const OAUTH_PROVIDER_KEY = 'clixa_oauth_provider'
// `'login'` or `'signup'` — captures which dialog the user was in when
// they kicked off OAuth, so on the callback round-trip we can re-mount
// the same dialog (with a loading overlay) instead of flashing a
// generic full-screen splash.
const OAUTH_INTENT_KEY = 'clixa_oauth_intent'
// Marketing-consent checkbox value captured on the signup dialog before the
// OAuth redirect. Read once on callback and forwarded to the backend exchange
// so `marketing_consent_at` is set at user creation time. Only meaningful for
// signups; ignored on plain logins.
const MARKETING_CONSENT_KEY = 'clixa_marketing_consent'
// The hash route the user was on when they kicked off OAuth. The IdP
// round-trip blows away the hash, so without stashing it a user who
// clicked "Sign in" from a deep link (e.g. #settings, #pro) lands back
// on the generic #thumbnails screen instead of where they intended.
// Captured in buildAuthorizeUrl(), consumed in consumeOAuthCallback().
const OAUTH_RETURN_TO_KEY = 'clixa_oauth_return_to'
const DEFAULT_RETURN_HASH = '#thumbnails'

export function setMarketingConsent(value) {
  try {
    sessionStorage.setItem(MARKETING_CONSENT_KEY, value ? '1' : '0')
  } catch {
    /* sessionStorage may be unavailable */
  }
}

function consumeMarketingConsent() {
  try {
    const v = sessionStorage.getItem(MARKETING_CONSENT_KEY)
    sessionStorage.removeItem(MARKETING_CONSENT_KEY)
    if (v === '1') return true
    if (v === '0') return false
    return null
  } catch {
    return null
  }
}

export function setOAuthIntent(intent) {
  try {
    if (intent === 'login' || intent === 'signup') {
      sessionStorage.setItem(OAUTH_INTENT_KEY, intent)
    }
  } catch {
    /* sessionStorage may be unavailable */
  }
}

export function readOAuthIntent() {
  try {
    const v = sessionStorage.getItem(OAUTH_INTENT_KEY)
    return v === 'login' || v === 'signup' ? v : null
  } catch {
    return null
  }
}

export function clearOAuthIntent() {
  try {
    sessionStorage.removeItem(OAUTH_INTENT_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Read-and-clear the hash route the user was on when they started the
 * OAuth flow (set in `buildAuthorizeUrl`). Returns a normalized hash
 * string (always leading '#') or the default thumbnails hash when there
 * was nothing useful to restore. One-shot: the key is removed on read so
 * a later non-OAuth dialog open can't pick up a stale destination.
 */
export function consumeOAuthReturnTo() {
  try {
    const v = sessionStorage.getItem(OAUTH_RETURN_TO_KEY)
    sessionStorage.removeItem(OAUTH_RETURN_TO_KEY)
    if (!v || typeof v !== 'string') return DEFAULT_RETURN_HASH
    return v.startsWith('#') ? v : `#${v}`
  } catch {
    return DEFAULT_RETURN_HASH
  }
}

// One-shot migration of the v1 brand keys ("scriptz_*"). Runs once at module
// load: if the new key is empty but a legacy key exists, copy the value over
// then delete the old one so already-signed-in users don't get bumped to login.
const LEGACY_TOKENS_KEY = 'scriptz_session'
const LEGACY_PKCE_KEY = 'scriptz_oauth_pkce'
const LEGACY_STATE_KEY = 'scriptz_oauth_state'
const LEGACY_PROVIDER_KEY = 'scriptz_oauth_provider'
try {
  if (typeof localStorage !== 'undefined') {
    if (!localStorage.getItem(TOKENS_STORAGE_KEY)) {
      const legacy = localStorage.getItem(LEGACY_TOKENS_KEY)
      if (legacy) localStorage.setItem(TOKENS_STORAGE_KEY, legacy)
    }
    localStorage.removeItem(LEGACY_TOKENS_KEY)
  }
  if (typeof sessionStorage !== 'undefined') {
    for (const [next, legacy] of [
      [PKCE_VERIFIER_KEY, LEGACY_PKCE_KEY],
      [OAUTH_STATE_KEY, LEGACY_STATE_KEY],
      [OAUTH_PROVIDER_KEY, LEGACY_PROVIDER_KEY],
    ]) {
      if (!sessionStorage.getItem(next)) {
        const v = sessionStorage.getItem(legacy)
        if (v) sessionStorage.setItem(next, v)
      }
      sessionStorage.removeItem(legacy)
    }
  }
} catch {
  /* storage may be unavailable — silent fail */
}

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_SCOPES = 'openid email profile'

export const SESSION_STORAGE_KEY = TOKENS_STORAGE_KEY

export function isGoogleConfigured() {
  return Boolean(GOOGLE_CLIENT_ID)
}

function redirectUri() {
  if (typeof window === 'undefined') return ''
  // Trailing slash matters: must exactly match what's registered in the
  // IdP's redirect-URI list. Vite dev serves at http://localhost:5173/.
  return `${window.location.origin}${window.location.pathname}`
}

function base64UrlEncode(bytes) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function generatePkce() {
  const random = new Uint8Array(32)
  crypto.getRandomValues(random)
  const verifier = base64UrlEncode(random)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const challenge = base64UrlEncode(new Uint8Array(digest))
  return { verifier, challenge }
}

function newState() {
  const random = new Uint8Array(16)
  crypto.getRandomValues(random)
  return base64UrlEncode(random)
}

/**
 * Build Google's authorize URL. Stashes PKCE + state + provider tag in
 * sessionStorage so the redirect-back handler knows which backend
 * endpoint to call.
 */
export async function buildAuthorizeUrl(provider) {
  if (provider !== 'google') {
    throw new Error(`Unknown OAuth provider: ${provider}`)
  }
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('Google OAuth is not configured. Set VITE_GOOGLE_CLIENT_ID.')
  }

  const { verifier, challenge } = await generatePkce()
  const state = newState()
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier)
  sessionStorage.setItem(OAUTH_STATE_KEY, state)
  sessionStorage.setItem(OAUTH_PROVIDER_KEY, provider)
  // Remember where the user was so the post-callback routing can send
  // them back instead of defaulting to #thumbnails. Skip auth-screen
  // hashes (#signin/#login/#signup/#register) — returning to those
  // after a successful sign-in would just be a dead end.
  try {
    const h = (typeof window !== 'undefined' && window.location.hash) || ''
    const bare = h.replace(/^#/, '').split('?')[0].trim().toLowerCase()
    const isAuthHash = ['signin', 'login', 'signup', 'register', ''].includes(bare)
    sessionStorage.setItem(OAUTH_RETURN_TO_KEY, isAuthHash ? DEFAULT_RETURN_HASH : h)
  } catch {
    /* sessionStorage unavailable — callback will fall back to default */
  }

  const params = new URLSearchParams({
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    client_id: GOOGLE_CLIENT_ID,
    scope: GOOGLE_SCOPES,
    // Pin the access type so refreshes work without re-prompting (Google
    // only issues refresh_token when access_type=offline). Only relevant
    // if the BACKEND wanted refresh tokens — we don't, but harmless.
    access_type: 'online',
    prompt: 'select_account',
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

/**
 * If the current URL is an OAuth callback, exchange the code at the
 * matching backend endpoint and return `{access_token, refresh_token, user, expires_in}`.
 * Returns null when this isn't a callback. Throws on any failure.
 */
export async function consumeOAuthCallback() {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const errorParam = url.searchParams.get('error')

  if (errorParam) {
    cleanupCallbackUrl(url)
    const desc = url.searchParams.get('error_description') || errorParam
    // Dev-mode hint: `redirect_uri_mismatch` almost always means the
    // current origin isn't on the Google OAuth client's authorized
    // redirect-URIs list. Spell out the exact value to add so the
    // developer can fix it in one click in Google Cloud Console.
    if (
      errorParam === 'redirect_uri_mismatch' &&
      typeof import.meta !== 'undefined' &&
      import.meta.env?.DEV
    ) {
      throw new Error(
        `${desc}. Add ${redirectUri()} to the Google OAuth client's ` +
          `Authorized redirect URIs (Google Cloud Console → APIs & Services → ` +
          `Credentials → your OAuth client).`
      )
    }
    throw new Error(desc)
  }
  if (!code) return null

  const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY)
  if (!expectedState || expectedState !== state) {
    cleanupCallbackUrl(url)
    throw new Error('OAuth state mismatch — restart sign-in.')
  }
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY)
  const provider = sessionStorage.getItem(OAUTH_PROVIDER_KEY)
  if (!verifier || !provider) {
    cleanupCallbackUrl(url)
    throw new Error('Missing PKCE verifier — restart sign-in.')
  }

  // Pull the signup-time marketing-consent checkbox value (if any). null
  // means the user came from the login dialog or didn't pass a value, in
  // which case we don't send the field and the backend leaves any existing
  // consent state untouched.
  const marketingConsent = consumeMarketingConsent()
  const session = await exchangeWithBackend(provider, code, verifier, marketingConsent)

  sessionStorage.removeItem(PKCE_VERIFIER_KEY)
  sessionStorage.removeItem(OAUTH_STATE_KEY)
  sessionStorage.removeItem(OAUTH_PROVIDER_KEY)
  // Intent is consumed by App.jsx on the callback render; clear it
  // here so a subsequent regular open of the dialog (no OAuth) doesn't
  // pick up a stale value.
  sessionStorage.removeItem(OAUTH_INTENT_KEY)
  cleanupCallbackUrl(url)

  saveSession(session)
  return session
}

function cleanupCallbackUrl(url) {
  // OAuth callback debris from Google. Wipe everything we know is theirs —
  // `iss` (identity issuer claim), `hd` (hosted domain), and the rest —
  // so the URL bar reads cleanly after sign-in.
  ;[
    'code',
    'state',
    'error',
    'error_description',
    'scope',
    'authuser',
    'prompt',
    'session_state',
    'iss',
    'hd',
  ].forEach((k) => url.searchParams.delete(k))
  const clean =
    url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : '') + url.hash
  window.history.replaceState({}, '', clean)
}

async function exchangeWithBackend(provider, code, verifier, marketingConsent) {
  const body = {
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri(),
  }
  // Only include the field on first-time signups (login flows pass null).
  // Backend treats explicit `false` as a refusal, so don't default it.
  if (marketingConsent === true || marketingConsent === false) {
    body.marketing_consent = marketingConsent
  }
  const r = await fetch(`${getApiBaseUrl()}/api/auth/oauth/${provider}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    throw new Error(data?.error?.message || data?.detail || `Sign-in failed (${r.status})`)
  }
  // Backend returns: { access_token, refresh_token, expires_in, token_type, user }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (Number(data.expires_in) || 900) * 1000,
    user: data.user || null,
  }
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(TOKENS_STORAGE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (!o?.accessToken) return null
    return o
  } catch {
    return null
  }
}

export function saveSession(session) {
  if (!session) {
    localStorage.removeItem(TOKENS_STORAGE_KEY)
    return
  }
  localStorage.setItem(TOKENS_STORAGE_KEY, JSON.stringify(session))
}

export function clearSession() {
  localStorage.removeItem(TOKENS_STORAGE_KEY)
  sessionStorage.removeItem(PKCE_VERIFIER_KEY)
  sessionStorage.removeItem(OAUTH_STATE_KEY)
  sessionStorage.removeItem(OAUTH_PROVIDER_KEY)
}

/**
 * Refresh the access token using the stored refresh token.
 *
 * Returns one of:
 *   * a session object on success
 *   * `'invalid'` when the server says the refresh token is dead
 *     (401 / 403 / "not found" / "expired" / "revoked") — caller should
 *     clear the session locally because re-trying won't help.
 *   * `null` for any other failure (network blip, 5xx, timeout, CORS, etc.)
 *     — the local session is still valid; caller should NOT clear it
 *     and should retry on the next request.
 *
 * The previous shape (always null on any failure) caused a real bug: a
 * transient 502 during refresh wiped the user's session even though the
 * tokens on disk were fine. Multi-tab token rotation made it worse —
 * tab A's refresh would rotate the token, tab B's concurrent refresh
 * would 401 against the now-revoked token, and clearSession() in tab B
 * would kick the user out across every tab.
 */
export async function refreshSession(refreshToken) {
  if (!refreshToken) return 'invalid'
  let r
  try {
    r = await fetch(`${getApiBaseUrl()}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
  } catch {
    // Network error / DNS failure / offline. Local session is still fine —
    // the next call to the API will retry. Don't clear.
    return null
  }
  // 401/403 = backend says this refresh token is dead. Clear.
  if (r.status === 401 || r.status === 403) return 'invalid'
  // Any other non-2xx (5xx, 502/504 from CloudFront, rate-limit, etc.) is
  // a transient issue — keep the local session intact.
  if (!r.ok) return null
  const data = await r.json().catch(() => ({}))
  if (!data.access_token) return null
  const next = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: Date.now() + (Number(data.expires_in) || 900) * 1000,
    user: data.user || null,
  }
  saveSession(next)
  return next
}
