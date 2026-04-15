/** A/B test query + mutation hooks. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { abTestsApi } from '../../api/abTests'
import { getAccessTokenOrNull } from '../../lib/query/authToken'
import { queryFreshness } from '../../lib/query/queryConfig'
import { queryKeys } from '../../lib/query/queryKeys'
import { resultOrNullOnAuthFailure } from '../../lib/query/safeApi'

/** List ALL tests for the user (optionally scoped by channel / status). */
export function useAllABTestsQuery({ channelId, statusFilter } = {}) {
  return useQuery({
    queryKey: queryKeys.abTests.all({ channelId, statusFilter }),
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) return { items: [] }
      return resultOrNullOnAuthFailure(abTestsApi.list(token, { channelId, statusFilter }))
    },
    staleTime: queryFreshness.short,
  })
}

export function useABTestsForVideoQuery(videoId, channelId) {
  return useQuery({
    queryKey: queryKeys.abTests.list(videoId),
    enabled: !!videoId,
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) return { items: [] }
      return resultOrNullOnAuthFailure(abTestsApi.list(token, { videoId, channelId }))
    },
    staleTime: queryFreshness.short,
  })
}

export function useABTestResultsQuery(testId, { enabled = true } = {}) {
  return useQuery({
    queryKey: queryKeys.abTests.results(testId),
    enabled: !!testId && enabled,
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) return null
      return resultOrNullOnAuthFailure(abTestsApi.results(token, testId))
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
  })
}

function invalidateAll(queryClient) {
  queryClient.invalidateQueries({ queryKey: ['abTests'] })
}

export function useCreateABTestMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return abTestsApi.create(token, payload)
    },
    onSuccess: () => invalidateAll(queryClient),
  })
}

export function useAddVariationMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ testId, variation }) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return abTestsApi.addVariation(token, testId, variation)
    },
    onSuccess: () => invalidateAll(queryClient),
  })
}

export function useActivateVariantMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ testId, slug }) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return abTestsApi.activate(token, testId, slug)
    },
    onSuccess: () => invalidateAll(queryClient),
  })
}

export function usePromoteWinnerMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ testId, slug }) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return abTestsApi.promote(token, testId, slug || null)
    },
    onSuccess: () => invalidateAll(queryClient),
  })
}

export function usePauseABTestMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (testId) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return abTestsApi.pause(token, testId)
    },
    onSuccess: () => invalidateAll(queryClient),
  })
}

export function useResumeABTestMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (testId) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return abTestsApi.resume(token, testId)
    },
    onSuccess: () => invalidateAll(queryClient),
  })
}

export function useCompleteABTestMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (testId) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return abTestsApi.complete(token, testId)
    },
    onSuccess: () => invalidateAll(queryClient),
  })
}

/** Explicit, opt-in fetch of SRX-3 AI insights. Charges credits server-side. */
export function useLoadInsightsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (testId) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return abTestsApi.results(token, testId, { insights: true })
    },
    onSuccess: (data, testId) => {
      if (data) {
        queryClient.setQueryData(queryKeys.abTests.results(testId), data)
      }
      queryClient.invalidateQueries({ queryKey: ['billing'] })
    },
  })
}

export function useRestoreOriginalMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (testId) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return abTestsApi.restoreOriginal(token, testId)
    },
    onSuccess: () => invalidateAll(queryClient),
  })
}

export function useDeleteABTestMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (testId) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return abTestsApi.remove(token, testId)
    },
    onSuccess: () => invalidateAll(queryClient),
  })
}

// Legacy (kept so the old VideoOptimizeModal ABTestPanel still compiles).
export function useSwitchABTestMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ testId, variationB }) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return abTestsApi.switch(token, testId, variationB)
    },
    onSuccess: () => invalidateAll(queryClient),
  })
}
