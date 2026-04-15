import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query'

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
        retry: (failureCount, error) => {
          const s = error?.status
          if (s === 401 || s === 402 || s === 403 || s === 404) return false
          return failureCount < 2
        },
        staleTime: 1000 * 60 * 3,
        gcTime: 1000 * 60 * 30,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
        networkMode: 'offlineFirst',
      },
      mutations: {
        retry: 0,
        networkMode: 'offlineFirst',
      },
    },
  })
}
