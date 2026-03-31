import { QueryClient } from '@tanstack/react-query'

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          const s = error?.status
          if (s === 401 || s === 403 || s === 404) return false
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
