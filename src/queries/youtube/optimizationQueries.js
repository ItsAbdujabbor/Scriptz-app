import { useQuery, useQueryClient } from '@tanstack/react-query'
import { youtubeApi } from '../../api/youtube'
import { queryFreshness } from '../../lib/query/queryConfig'
import { queryKeys } from '../../lib/query/queryKeys'
import { getAccessTokenOrNull } from '../../lib/query/authToken'
import { invalidateCredits } from '../billing/creditsQueries'

export function useYoutubeVideoOptimization({ videoId, channelId, enabled }) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: queryKeys.youtube.videoOptimization(videoId),
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      const out = await youtubeApi.optimizeVideo(token, videoId, channelId || null)
      // /api/youtube/optimize-video debits `seo_optimize` credits server-side.
      invalidateCredits(queryClient)
      return out
    },
    enabled: enabled && !!videoId,
    staleTime: queryFreshness.short,
  })
}
