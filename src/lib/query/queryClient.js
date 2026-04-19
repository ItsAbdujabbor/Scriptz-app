import { QueryClient } from '@tanstack/react-query'

/**
 * Keep defaults conservative to avoid unnecessary refetching.
 * Most "how fresh" decisions should live on a per-query basis via staleTime.
 */
export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Never block UI with loading spinners when cache exists.
        // Components can still show skeletons via isPending if desired.
        retry: 2,
        staleTime: 0,
        gcTime: 1000 * 60 * 10, // 10 minutes
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: {
        retry: 0,
      },
    },
  })
}

