/**
 * Single auth mode: direct OAuth (Google), code exchange handled
 * server-side by /api/auth/oauth/google. Kept as a thin shim so
 * legacy callers that import API_AUTH_STORAGE_KEY continue to compile.
 */
export { SESSION_STORAGE_KEY as API_AUTH_STORAGE_KEY } from './oauthClient'
