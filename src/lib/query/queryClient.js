import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query'
import { aiAwareShouldRetry, aiAwareRetryDelay } from '../aiErrors'

// Global paywall interceptor — any query or mutation that comes back as
// 402 with one of the recognised paywall codes redirects the user to
// the pricing screen.
//
//   NO_ACTIVE_SUBSCRIPTION → tried to use a premium-only feature
//                            (Persona / Styles / Edit / Score /
//                            One-click fix / Max model)
//   INSUFFICIENT_CREDITS   → ran out of credits on a credit-deductible
//                            feature (Generate / Recreate / Analyze /
//                            Titles)
//
// Both redirect to /pro silently — no error banner.
const PAYWALL_CODES = new Set(['NO_ACTIVE_SUBSCRIPTION', 'INSUFFICIENT_CREDITS'])

function maybeRedirectToPaywall(error) {
  if (!error) return
  if (error.status !== 402) return
  const code = error.code || error.body?.error?.code || error.body?.detail?.code
  if (!code || !PAYWALL_CODES.has(code)) return
  if (typeof window === 'undefined') return
  // Avoid loop if we're already on the pricing page.
  if ((window.location.hash || '').replace(/^#/, '').startsWith('pro')) return
  window.location.hash = 'pro'
}

export function createAppQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({ onError: maybeRedirectToPaywall }),
    mutationCache: new MutationCache({ onError: maybeRedirectToPaywall }),
    defaultOptions: {
      queries: {
        // Use the shared retry-policy: skips 4xx (except idempotency
        // 409), backs off with Retry-After honoring + exponential
        // fallback. Without this, a single Gemini rate-limit could
        // amplify into a tight retry loop across the whole app.
        retry: aiAwareShouldRetry,
        retryDelay: aiAwareRetryDelay,
        staleTime: 1000 * 60 * 3,
        gcTime: 1000 * 60 * 30,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
        networkMode: 'offlineFirst',
      },
      mutations: {
        // Mutations don't auto-retry by default — a duplicate mutation
        // can have side effects (charge credits, send a message). Routes
        // that opt in to retry can override per-mutation; the
        // Idempotency-Key header on generate routes covers safety there.
        retry: 0,
        networkMode: 'offlineFirst',
      },
    },
  })
}
