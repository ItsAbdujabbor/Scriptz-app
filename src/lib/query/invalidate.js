import { queryKeys } from './queryKeys'

/**
 * Targeted invalidation helpers to keep mutation side effects small.
 */
export function invalidateYoutubeChannelSwitch(queryClient) {
  queryClient.invalidateQueries({ queryKey: queryKeys.youtube.channels() })
  queryClient.invalidateQueries({ queryKey: queryKeys.youtube.activeChannel() })
}

export function invalidateDashboardWidgets(queryClient, channelId) {
  const id = channelId ?? 'onboarding'
  queryClient.invalidateQueries({ queryKey: ['dashboard', 'insights', id] })
  if (channelId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.audit(channelId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.growth(channelId) })
    // Snapshot/best-time are parameterized; invalidate by partial match for channelId only.
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'snapshot', channelId] })
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'bestTime', channelId] })
  }
}

