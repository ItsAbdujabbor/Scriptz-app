/**
 * Centralized Vite env helpers. API modules use getApiBaseUrl() so dev/prod
 * behavior (proxy vs absolute URL) stays consistent.
 */

export function getViteEnv() {
  return typeof import.meta !== 'undefined' ? import.meta.env : undefined
}

/**
 * Backend origin for fetch(). In dev, prefer VITE_API_BASE_URL when provided
 * so API requests do not depend on the Vite proxy; otherwise fall back to the
 * proxy with ''. In production uses VITE_API_BASE_URL or falls back to
 * http://localhost:8000.
 */
export function getApiBaseUrl() {
  const env = getViteEnv()
  const explicit = env?.VITE_API_BASE_URL
  if (env?.DEV) {
    return explicit && String(explicit).trim() !== ''
      ? String(explicit).trim().replace(/\/$/, '')
      : ''
  }
  return explicit && String(explicit).trim() !== ''
    ? String(explicit).trim().replace(/\/$/, '')
    : 'http://localhost:8000'
}
