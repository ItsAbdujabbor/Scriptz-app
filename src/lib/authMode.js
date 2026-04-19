import { isSupabaseConfigured } from './supabaseClient'

/** Persisted session for VITE_USE_LOCAL_API_AUTH (FastAPI JWT, no Supabase). */
export const API_AUTH_STORAGE_KEY = 'scriptz_api_auth'

/**
 * Local API auth: email/password via `/api/auth/*`, tokens in memory + localStorage.
 * Default in dev = on (fast, no Supabase network). Production defaults to Supabase when configured.
 *
 * VITE_USE_LOCAL_API_AUTH=true  — force local API auth
 * VITE_USE_LOCAL_API_AUTH=false — force Supabase (when configured)
 */
export function isLocalApiAuthMode() {
  const env = typeof import.meta !== 'undefined' ? import.meta.env : {}
  const v = String(env.VITE_USE_LOCAL_API_AUTH ?? '')
    .toLowerCase()
    .trim()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  if (env.DEV) return true
  return !isSupabaseConfigured()
}
