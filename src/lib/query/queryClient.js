import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query'
import { aiAwareShouldRetry, aiAwareRetryDelay } from '../aiErrors'

// Global paywall interceptor — any query or mutation that comes back as
// 402 NO_ACTIVE_SUBSCRIPTION redirects the user to the pricing screen.
function maybeRedirectToPaywall(error) {
  if (!error) return
  const is402 = error.status === 402
  const isPaywall =
    error.code === 'NO_ACTIVE_SUBSCRIPTION' || error.body?.error?.code === 'NO_ACTIVE_SUBSCRIPTION'
  if (!is402 || !isPaywall) return
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
