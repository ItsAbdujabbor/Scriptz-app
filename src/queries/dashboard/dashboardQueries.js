import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dashboardApi } from '../../api/dashboard'
import { queryFreshness } from '../../lib/query/queryConfig'
import { queryKeys } from '../../lib/query/queryKeys'
import { getAccessTokenOrNull } from '../../lib/query/authToken'

export function useDashboardInsights(channelId) {
  return useQuery({
    queryKey: queryKeys.dashboard.insights(channelId),
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      if (channelId) return dashboardApi.getInsights(token, channelId, true)
      return dashboardApi.getOnboardingInsights(token)
    },
    staleTime: 0,
  })
}

export function useDashboardAudit(channelId) {
  return useQuery({
    queryKey: queryKeys.dashboard.audit(channelId),
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return dashboardApi.getChannelAudit(token, channelId)
    },
    enabled: !!channelId,
    staleTime: queryFreshness.medium,
  })
}

export function useDashboardGrowth(channelId) {
  return useQuery({
    queryKey: queryKeys.dashboard.growth(channelId),
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return dashboardApi.getGrowth(token, channelId)
    },
    enabled: !!channelId,
    staleTime: queryFreshness.medium,
  })
}

export function useDashboardSnapshot(channelId, from, to) {
  return useQuery({
    queryKey: queryKeys.dashboard.snapshot(channelId, from, to),
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return dashboardApi.getSnapshot(token, channelId, from, to)
    },
    enabled: !!channelId && !!from && !!to,
    staleTime: queryFreshness.long,
  })
}

export function useDashboardBestTime(channelId, utcOffsetMinutes) {
  return useQuery({
    queryKey: queryKeys.dashboard.bestTime(channelId, utcOffsetMinutes),
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return dashboardApi.getBestTime(token, channelId, utcOffsetMinutes)
    },
    enabled: !!channelId && utcOffsetMinutes != null,
    staleTime: queryFreshness.long,
  })
}

export function useIdeaFeedbackMutation({ channelId }) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ idea, interested, reason = null, details = null }) => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return dashboardApi.submitIdeaFeedback(token, {
        idea_title: idea?.idea_title ?? idea?.title ?? 'Script idea',
        short_script: idea?.short_script ?? idea?.script ?? idea?.description ?? null,
        interested,
        reason: interested ? null : reason,
        details: interested ? null : details,
      })
    },
    onMutate: async ({ idea }) => {
      const key = queryKeys.dashboard.insights(channelId)
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData(key)

      queryClient.setQueryData(key, (old) => {
        if (!old) return old
        const titleA = idea?.idea_title ?? idea?.title
        return {
          ...old,
          script_suggestions: (old.script_suggestions || []).filter((s) => {
            const t = s?.idea_title ?? s?.title
            return t !== titleA
          }),
        }
      })

      return { previous }
    },
    onError: (err, _vars, ctx) => {
      if (!ctx?.previous) return
      const key = queryKeys.dashboard.insights(channelId)
      queryClient.setQueryData(key, ctx.previous)
    },
    onSuccess: () => {
      const key = queryKeys.dashboard.insights(channelId)
      queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

