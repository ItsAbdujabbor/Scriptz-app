import { createClient } from '@supabase/supabase-js'

const url = typeof import.meta !== 'undefined' ? import.meta.env.VITE_SUPABASE_URL : ''
const anon = typeof import.meta !== 'undefined' ? import.meta.env.VITE_SUPABASE_ANON_KEY : ''

export function isSupabaseConfigured() {
  return Boolean(url && anon && url.startsWith('http'))
}

/**
 * Browser Supabase client (anon key). Configure VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.
 * Dashboard: Authentication → Providers (Email, Google) → URL configuration (redirect URLs).
 */
export const supabase = isSupabaseConfigured()
  ? createClient(url, anon, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  : null
