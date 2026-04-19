import { useQuery } from '@tanstack/react-query'
import { youtubeApi } from '../../api/youtube'
import { queryFreshness } from '../../lib/query/queryConfig'
import { queryKeys } from '../../lib/query/queryKeys'
import { getAccessTokenOrNull } from '../../lib/query/authToken'

export function useYoutubeVideoOptimization({ videoId, enabled }) {
  return useQuery({
    queryKey: queryKeys.youtube.videoOptimization(videoId),
    queryFn: async () => {
      const token = await getAccessTokenOrNull()
      if (!token) throw new Error('Not authenticated')
      return youtubeApi.optimizeVideo(token, videoId)
    },
    enabled: enabled && !!videoId,
    staleTime: queryFreshness.short,
  })
}

