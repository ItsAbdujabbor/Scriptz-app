/**
 * Centralized Vite env helpers. API modules use getApiBaseUrl() so dev/prod
 * behavior (proxy vs absolute URL) stays consistent.
 */

export function getViteEnv() {
  return typeof import.meta !== 'undefined' ? import.meta.env : undefined
}

/**
 * Backend origin for fetch().
 *
 * - Dev: prefer VITE_API_BASE_URL when provided; otherwise '' so the Vite
 *   proxy at /api → 127.0.0.1:8000 handles routing without CORS.
 * - Prod: prefer VITE_API_BASE_URL; otherwise infer from window.location.
 *   The infer step is the load-bearing fix: GitHub Actions does not inject
 *   VITE_API_BASE_URL into the build, and the old fallback was
 *   `http://localhost:8000` — which meant every API call from the live
 *   clixa.app SPA pointed at the user's own machine and failed silently
 *   (OAuth code exchange included).
 *
 *   Origin map: clixa.app → API CloudFront. Any other host returns '' so
 *   reverse-proxied / preview deploys keep working same-origin.
 */
const PROD_API_BASE_BY_HOST = {
  'clixa.app': 'https://d7kxty5tnk6a8.cloudfront.net',
  'www.clixa.app': 'https://d7kxty5tnk6a8.cloudfront.net',
}

export function getApiBaseUrl() {
  const env = getViteEnv()
  const explicit = env?.VITE_API_BASE_URL
  if (explicit && String(explicit).trim() !== '') {
    return String(explicit).trim().replace(/\/$/, '')
  }
  if (env?.DEV) return ''
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (PROD_API_BASE_BY_HOST[host]) return PROD_API_BASE_BY_HOST[host]
  }
  return ''
}
